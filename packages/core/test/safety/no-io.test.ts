import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSession, emitResponse, itemPath, type Answer, type ExpressionEvaluator, type OptionResolver, type Questionnaire, type QuestionnaireResponse } from '../../src/index.js';
import { hydrateSession, restoreSession, snapshot } from '../../src/resume.js';
import { createView } from '../../src/view/index.js';

/**
 * AC-14.6.1, NFR-X-01, NFR-X-02 (M4 AC-8): no network, no storage, no
 * telemetry — as a test, not a promise. Every door out of the process that the
 * criterion names is replaced by a stub that records the touch and throws;
 * then a full `@fhirq/core` lifecycle runs through the public entry points,
 * with every collaborator a host can plug in, and not one stub may have been
 * touched. A collaborator that settles and one that fails are both in-memory:
 * whatever a host's resolver does is the host's, and core never reaches out.
 *
 * `@fhirq/react` and `@fhirq/themes` join this test in M6 and M8, and the
 * element's default-resolver variant in M7.
 */

const touched: string[] = [];
const restore: (() => void)[] = [];

/** Replaces `name` on `target` with a getter and setter that record the touch and throw. */
function trap(target: object, name: string, label = name): void {
  const before = Object.getOwnPropertyDescriptor(target, name);
  const refuse = (): never => {
    touched.push(label);
    throw new Error(`${label} is off limits to @fhirq/core`);
  };
  Object.defineProperty(target, name, { configurable: true, get: refuse, set: refuse });
  restore.push(() => {
    if (before === undefined) Reflect.deleteProperty(target, name);
    else Object.defineProperty(target, name, before);
  });
}

beforeAll(() => {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB']) trap(globalThis, name);
  const navigator = {};
  trap(navigator, 'sendBeacon', 'navigator.sendBeacon');
  const document = {};
  trap(document, 'cookie', 'document.cookie');
  for (const [name, value] of [
    ['navigator', navigator],
    ['document', document],
  ] as const) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    restore.push(() => {
      if (before === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, before);
    });
  }
});

afterAll(() => {
  for (const undo of restore.reverse()) undo();
});

const VS = 'http://example.org/ValueSet/route';
const FORM: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'draft',
  url: 'http://example.org/Questionnaire/no-io',
  item: [
    { linkId: 'height', type: 'decimal', text: 'Height (m)' },
    { linkId: 'weight', type: 'decimal', text: 'Weight (kg)' },
    { linkId: 'bmi', type: 'decimal', extension: [{ url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression', valueExpression: { language: 'text/fhirpath', expression: 'bmi' } }] },
    { linkId: 'route', type: 'choice', answerValueSet: VS },
    { linkId: 'other', type: 'open-choice', answerValueSet: `${VS}|2` },
    {
      linkId: 'smoker',
      type: 'boolean',
      text: 'Do you smoke?',
      _text: { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/rendering-xhtml', valueString: '<b>Do you smoke?</b>' }] },
    },
    { linkId: 'amount', type: 'string', required: true, enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
    { linkId: 'meds', type: 'group', repeats: true, item: [{ linkId: 'dose', type: 'integer' }] },
  ],
};

const flush = () => new Promise<void>((resolve) => void Promise.resolve().then(() => resolve()));

describe('no network, no storage, no telemetry (AC-14.6.1, NFR-X-01, NFR-X-02)', () => {
  it('traps every door the criterion names', () => {
    const doors: (() => unknown)[] = [
      () => (globalThis as Record<string, unknown>)['fetch'],
      () => (globalThis as Record<string, unknown>)['localStorage'],
      () => ((globalThis as Record<string, unknown>)['navigator'] as Record<string, unknown>)['sendBeacon'],
      () => ((globalThis as Record<string, unknown>)['document'] as Record<string, unknown>)['cookie'],
    ];
    for (const door of doors) expect(door).toThrow('off limits');
    expect(touched).toEqual(['fetch', 'localStorage', 'navigator.sendBeacon', 'document.cookie']);
    touched.length = 0;
  });

  it('runs a full @fhirq/core lifecycle, every collaborator included, and touches none', async () => {
    let failOnce = true;
    const resolver: OptionResolver = (valueSet) => {
      if (valueSet.endsWith('|2') && failOnce) {
        failOnce = false;
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve([{ system: 'urn:routes', code: 'oral', display: 'By mouth' }]);
    };
    const evaluator: ExpressionEvaluator = {
      evaluate: (_, { projection }) => {
        const read = (linkId: string) => projection.nodes.find((node) => node.item.linkId === linkId)?.answers[0]?.value;
        const height = read('height');
        const weight = read('weight');
        return typeof height === 'number' && typeof weight === 'number' ? { kind: 'decimal', value: weight / height ** 2 } : undefined;
      },
    };
    const errors: unknown[] = [];
    const collaborators = {
      resolver,
      evaluator,
      sanitize: (xhtml: string) => xhtml,
      onCollaboratorError: (error: unknown) => void errors.push(error),
      rules: [{ inputs: ['height', 'weight'], check: () => null }],
      scorers: { doses: { inputs: ['dose'], score: () => 1 } },
    };
    const options = { ...collaborators, hostIdentity: { subject: { reference: 'Patient/1' } } };

    const session = createSession(FORM, options);
    const view = createView(session, { idPrefix: 'io', messages: { yes: 'Ja' } });
    view.subscribe(() => undefined);
    await flush();
    expect(session.getSnapshot().optionSets[`${VS}|2`]?.status).toBe('failed');
    expect(session.dispatch({ type: 'RetryOptions', valueSet: `${VS}|2` })).toEqual({ outcome: 'applied' });
    await flush();
    const set = (path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: itemPath(path), answers });
    set('height', [{ kind: 'decimal', value: 1.8 }]);
    set('weight', [{ kind: 'decimal', value: 81 }]);
    set('route', [{ kind: 'coding', value: { system: 'urn:routes', code: 'oral' } }]);
    set('smoker', [{ kind: 'boolean', value: true }]);
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('amount') });
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    session.dispatch({ type: 'SetAnswer', path: itemPath('meds', 1, 'dose'), answers: [{ kind: 'integer', value: 2 }] });
    session.dispatch({ type: 'RequestCompletion' });
    expect(view.getSnapshot().errorSummary).not.toBeNull();
    set('amount', [{ kind: 'string', value: 'ten' }]);
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });

    const response = emitResponse(session);
    const restored = restoreSession(FORM, JSON.parse(JSON.stringify(snapshot(session))), collaborators);
    const hydrated = hydrateSession(FORM, JSON.parse(JSON.stringify(response)) as QuestionnaireResponse, options);
    await flush();
    const authored = { authored: response.authored ?? '' };
    expect(emitResponse(restored, authored)).toEqual(response);
    expect(emitResponse(hydrated, authored)).toEqual({ ...response, status: 'in-progress' });
    for (const done of [session, restored, hydrated]) done.dispose();

    expect(errors).toHaveLength(1);
    expect(touched).toEqual([]);
  });
});
