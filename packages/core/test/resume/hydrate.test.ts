import { describe, expect, it } from 'vitest';

import { createSession, emitResponse, itemPath, type Answer, type ItemPath, type Questionnaire, type QuestionnaireResponse, type Session } from '../../src/index.js';
import { hydrateSession } from '../../src/resume.js';
import { bool, text } from '../slice.js';

const at = (path: string) => path as ItemPath;
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: at(path), answers });
const emit = (session: Session) => emitResponse(session, { authored: '2026-09-18' });
const answersOf = (session: Session) => Object.fromEntries(session.getSnapshot().nodes.filter((node) => node.answers.length > 0).map((node) => [node.path, node.answers]));
const found = (session: Session) =>
  session.diagnostics.map((finding) => ({ code: finding.code, path: finding.path, ...(finding.expected === undefined ? {} : { expected: finding.expected, found: finding.found }), ...(finding.detail === null ? {} : { detail: finding.detail }) }));

const URL = 'http://example.org/Questionnaire/visit';

const VISIT: Questionnaire = {
  resourceType: 'Questionnaire',
  url: URL,
  version: '2',
  status: 'active',
  item: [
    { linkId: 'smoker', type: 'boolean' },
    { linkId: 'amount', type: 'integer', enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
    {
      linkId: 'meds',
      type: 'group',
      repeats: true,
      item: [
        { linkId: 'name', type: 'string' },
        { linkId: 'taking', type: 'boolean' },
        { linkId: 'dose', type: 'string', enableWhen: [{ question: 'taking', operator: '=', answerBoolean: true }] },
      ],
    },
    { linkId: 'tags', type: 'string', repeats: true },
    { linkId: 'about', type: 'group', item: [{ linkId: 'born', type: 'date' }] },
    { linkId: 'note', type: 'display', text: 'Thanks' },
  ],
};

const response = (item: readonly unknown[], extra: Partial<QuestionnaireResponse> = {}): QuestionnaireResponse => ({
  resourceType: 'QuestionnaireResponse',
  questionnaire: `${URL}|2`,
  status: 'in-progress',
  item,
  ...extra,
});

describe('hydration (US-06.1, 04-domain.md §8)', () => {
  it('loads every answer, settles enablement on them and rebuilds repeat instances in stored order (AC-06.1.1, INV-E-11)', () => {
    const session = hydrateSession(
      VISIT,
      response([
        { linkId: 'smoker', answer: [{ valueBoolean: true }] },
        { linkId: 'amount', answer: [{ valueInteger: 10 }] },
        { linkId: 'meds', item: [{ linkId: 'name', answer: [{ valueString: 'first' }] }] },
        { linkId: 'meds', item: [{ linkId: 'name', answer: [{ valueString: 'second' }] }, { linkId: 'taking', answer: [{ valueBoolean: true }] }, { linkId: 'dose', answer: [{ valueString: '5 mg' }] }] },
        { linkId: 'tags', answer: [{ valueString: 'a' }, { valueString: 'b' }] },
      ]),
    );
    expect(session.diagnostics).toEqual([]);
    expect(session.getSnapshot().status).toBe('in-progress');
    expect(answersOf(session)).toEqual({
      smoker: bool(true),
      amount: [{ kind: 'integer', value: 10 }],
      'meds[0]/name': text('first'),
      'meds[1]/name': text('second'),
      'meds[1]/taking': bool(true),
      'meds[1]/dose': text('5 mg'),
      tags: [...text('a'), ...text('b')],
    });
    expect(session.getSnapshot().nodes.find((node) => node.path === 'meds')?.instances).toEqual([0, 1]);
  });

  it('starts in-progress whatever the stored status, and surfaces nothing (AC-06.1.4, T2)', () => {
    for (const status of ['completed', 'amended', 'stopped'] as const) {
      const session = hydrateSession(VISIT, response([{ linkId: 'smoker', answer: [{ valueBoolean: false }] }], { status }));
      expect(session.getSnapshot()).toMatchObject({ status: 'in-progress', completionRefused: false });
      expect(session.getSnapshot().nodes.every((node) => !node.surfaced)).toBe(true);
    }
  });

  it('re-emits what it was given, ignoring authored and status (AC-06.1.2, INV-E-06)', () => {
    const original = createSession(VISIT, { hostIdentity: { subject: { reference: 'Patient/7' }, encounter: { reference: 'Encounter/1' } } });
    set(original, 'smoker', bool(true));
    set(original, 'amount', [{ kind: 'integer', value: 3 }]);
    original.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    original.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    set(original, 'meds[2]/name', text('last'));
    set(original, 'about/born', [{ kind: 'date', value: '1970' }]);
    original.dispatch({ type: 'RequestCompletion' });
    const emitted = emit(original);
    const hydrated = hydrateSession(VISIT, emitted);
    expect({ ...emit(hydrated), status: 'completed' }).toEqual(emitted);
  });

  it('reports version drift naming both canonicals, and continues (AC-06.3.1, INV-E-10)', () => {
    const item = [{ linkId: 'smoker', answer: [{ valueBoolean: true }] }];
    const drifted = hydrateSession(VISIT, response(item, { questionnaire: `${URL}|1` }));
    expect(found(drifted)).toEqual([{ code: 'version-drift', path: null, expected: `${URL}|2`, found: `${URL}|1` }]);
    expect(answersOf(drifted)).toEqual({ smoker: bool(true) });
    expect(found(hydrateSession(VISIT, response(item, { questionnaire: 'http://example.org/other' })))).toEqual([
      { code: 'version-drift', path: null, expected: `${URL}|2`, found: 'http://example.org/other' },
    ]);
    expect(hydrateSession(VISIT, response(item, { questionnaire: URL })).diagnostics).toEqual([]);
    const unnamed: Record<string, unknown> = { ...response(item) };
    delete unnamed['questionnaire'];
    expect(hydrateSession(VISIT, unnamed as unknown as QuestionnaireResponse).diagnostics).toEqual([]);
  });

  it('reports an orphan linkId and skips its subtree, which never reaches a later response (AC-06.1.3)', () => {
    const session = hydrateSession(
      VISIT,
      response([
        { linkId: 'gone', answer: [{ valueString: 'SENTINEL' }] },
        { linkId: 'about', item: [{ linkId: 'born', answer: [{ valueDate: '1990' }] }, { linkId: 'name', answer: [{ valueString: 'misplaced' }] }] },
        { linkId: 'smoker', answer: [{ valueBoolean: false }], item: [{ linkId: 'child' }] },
      ]),
    );
    // In document order, whatever the stored order; what the definition does not have comes last.
    expect(found(session)).toEqual([
      { code: 'orphan-answer', path: 'smoker/child' },
      { code: 'orphan-answer', path: 'about/name' },
      { code: 'orphan-answer', path: 'gone' },
    ]);
    expect(JSON.stringify(emit(session))).not.toContain('SENTINEL');
    expect(answersOf(session)).toEqual({ smoker: bool(false), 'about/born': [{ kind: 'date', value: '1990' }] });
  });

  it('quarantines an answer the item cannot hold, naming expected and found types and never the value (AC-06.3.2, T6)', () => {
    const session = hydrateSession(
      VISIT,
      response([
        { linkId: 'smoker', answer: [{ valueString: 'SENTINEL-yes' }] },
        { linkId: 'tags', answer: [{ valueString: 'ok' }, { valueTime: '10:00:00' }] },
        { linkId: 'about', item: [{ linkId: 'born', answer: [{ valueDate: 'not-a-date' }] }] },
        { linkId: 'note', answer: [{ valueString: 'x' }] },
        { linkId: 'amount', answer: [{ valueInteger: 1, valueString: 'two' }] },
      ]),
    );
    expect(found(session)).toEqual([
      { code: 'quarantined-answer', path: 'smoker', expected: 'boolean', found: 'string' },
      { code: 'quarantined-answer', path: 'amount', expected: 'integer', found: 'malformed' },
      { code: 'quarantined-answer', path: 'tags', expected: 'string', found: 'string|Time' },
      { code: 'quarantined-answer', path: 'about/born', expected: 'date', found: 'malformed' },
      { code: 'quarantined-answer', path: 'note', expected: 'none', found: 'string' },
    ]);
    expect(answersOf(session)).toEqual({});
    expect(JSON.stringify(session.diagnostics)).not.toContain('SENTINEL');
  });

  it('loads none of several answers on a single-answer item, nor a single-answer item stored twice (AC-06.3.3)', () => {
    const session = hydrateSession(
      VISIT,
      response([
        { linkId: 'smoker', answer: [{ valueBoolean: true }, { valueBoolean: false }] },
        { linkId: 'about', item: [{ linkId: 'born', answer: [{ valueDate: '1990' }] }] },
        { linkId: 'about', item: [{ linkId: 'born', answer: [{ valueDate: '1991' }] }] },
        { linkId: 'meds', answer: [{ valueString: 'on a group' }] },
      ]),
    );
    expect(found(session)).toEqual([
      { code: 'quarantined-answer', path: 'smoker', expected: '1', found: '2', detail: 'too-many-answers' },
      { code: 'quarantined-answer', path: 'meds[0]', expected: 'none', found: 'string' },
      { code: 'quarantined-answer', path: 'about', expected: '1', found: '2', detail: 'repeated-item' },
    ]);
    expect(answersOf(session)).toEqual({});
  });

  it('drops an answer that lands on a disabled item, so none is retained (AC-06.1.5, T7)', () => {
    const session = hydrateSession(
      VISIT,
      response([
        { linkId: 'smoker', answer: [{ valueBoolean: false }] },
        { linkId: 'amount', answer: [{ valueInteger: 20 }] },
        { linkId: 'meds', item: [{ linkId: 'taking', answer: [{ valueBoolean: false }] }, { linkId: 'dose', answer: [{ valueString: 'stale' }] }] },
      ]),
    );
    expect(found(session)).toEqual([
      { code: 'hydrated-answer-disabled', path: 'amount' },
      { code: 'hydrated-answer-disabled', path: 'meds[0]/dose' },
    ]);
    set(session, 'smoker', bool(true));
    expect(session.getSnapshot().nodes.find((node) => node.path === 'amount')?.answers).toEqual([]);
  });

  it('quarantines an answer on a calculated item, whose value only its evaluator gives (ADR-0003)', () => {
    const calculated: Questionnaire = {
      ...VISIT,
      item: [
        {
          linkId: 'score',
          type: 'integer',
          extension: [{ url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression', valueExpression: { language: 'text/fhirpath', expression: '1' } }],
        },
      ],
    };
    const session = hydrateSession(calculated, response([{ linkId: 'score', answer: [{ valueInteger: 4 }] }]));
    expect(found(session).filter((finding) => finding.code !== 'no-evaluator')).toEqual([
      { code: 'quarantined-answer', path: 'score', expected: 'none', found: 'integer', detail: 'calculated' },
    ]);
  });

  it('takes the host identity from the options, or else from the response', () => {
    const stored = response([], { subject: { reference: 'Patient/1' }, author: { reference: 'Practitioner/1' } });
    expect(emit(hydrateSession(VISIT, stored))).toMatchObject({ subject: { reference: 'Patient/1' }, author: { reference: 'Practitioner/1' } });
    const overridden = emit(hydrateSession(VISIT, stored, { hostIdentity: { subject: { reference: 'Patient/2' } } }));
    expect(overridden.subject).toEqual({ reference: 'Patient/2' });
    expect(overridden).not.toHaveProperty('author');
  });

  it('keeps load findings first, then its own, and loads as lenient when asked', () => {
    const lenient = hydrateSession({ ...VISIT, item: [...(VISIT.item ?? []), { linkId: 'file', type: 'attachment' }] }, response([{ linkId: 'file', answer: [{ valueAttachment: {} }] }]), {
      loadMode: 'lenient',
    });
    expect(found(lenient)).toEqual([
      { code: 'unsupported-item-type', path: 'file', detail: 'attachment' },
      { code: 'quarantined-answer', path: 'file', expected: 'none', found: 'Attachment' },
    ]);
  });

  it('quarantines a quantity with a comparator and reads codings and quantities by their fields', () => {
    const q: Questionnaire = { ...VISIT, item: [{ linkId: 'dose', type: 'quantity' }, { linkId: 'pick', type: 'choice', answerValueSet: 'http://example.org/vs' }] };
    const session = hydrateSession(
      q,
      response([
        { linkId: 'dose', answer: [{ valueQuantity: { value: 5, comparator: '<', unit: 'mg' } }] },
        { linkId: 'pick', answer: [{ valueCoding: { system: 'urn:s', code: 'c', extension: [] } }] },
      ]),
    );
    expect(found(session)).toEqual([{ code: 'quarantined-answer', path: 'dose', expected: 'quantity', found: 'Quantity' }]);
    expect(answersOf(session)).toEqual({ pick: [{ kind: 'coding', value: { system: 'urn:s', code: 'c' } }] });
  });

  it.each([
    ['not a response', { resourceType: 'Questionnaire' }, 'not-a-questionnaire'],
    ['no resource at all', 'response', 'not-a-questionnaire'],
    ['a modifier extension', { resourceType: 'QuestionnaireResponse', status: 'in-progress', modifierExtension: [{}] }, 'modifier-extension'],
    ['items that are not a list', { resourceType: 'QuestionnaireResponse', item: {} }, 'malformed'],
    ['an item without a linkId', { resourceType: 'QuestionnaireResponse', item: [{ text: 'x' }] }, 'malformed'],
    ['answers that are not a list', { resourceType: 'QuestionnaireResponse', item: [{ linkId: 'a', answer: {} }] }, 'malformed'],
    ['a questionnaire that is not a string', { resourceType: 'QuestionnaireResponse', questionnaire: 1 }, 'malformed'],
    ['a subject that is not a reference', { resourceType: 'QuestionnaireResponse', subject: 'Patient/1' }, 'malformed'],
  ])('rejects %s with response-rejected, never for content (INV-E-08)', (_, stored, code) => {
    let thrown: unknown;
    try {
      hydrateSession(VISIT, stored as unknown as QuestionnaireResponse);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'response-rejected', findings: [{ code }] });
  });

  it('rejects the questionnaire before reading the response (§8 step 1)', () => {
    expect(() => hydrateSession({ resourceType: 'Questionnaire' }, response([]))).not.toThrow();
    let thrown: unknown;
    try {
      hydrateSession({ resourceType: 'Patient' } as unknown as Questionnaire, 'x' as unknown as QuestionnaireResponse);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'definition-rejected' });
  });
});
