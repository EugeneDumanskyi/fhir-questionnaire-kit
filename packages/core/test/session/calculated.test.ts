import { describe, expect, it, vi } from 'vitest';

import {
  createSession,
  emitResponse,
  itemPath,
  type Answer,
  type ExpressionEvaluator,
  type Questionnaire,
  type QuestionnaireResponse,
  type Session,
  type VisibleProjection,
} from '../../src/index.js';
import { hydrateSession, restoreSession, snapshot } from '../../src/resume.js';
import { bool, questionnaire } from '../slice.js';

const CALCULATED = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression';
const calculated = (expression: string, name?: string) => ({
  url: CALCULATED,
  valueExpression: { language: 'text/fhirpath', expression, ...(name === undefined ? {} : { name }) },
});

/** BMI from height and weight; weight is asked only when the respondent was weighed (ADR-0017 verification). */
const URL = 'http://example.org/Questionnaire/bmi';
const BMI: Questionnaire = {
  ...questionnaire([
    { linkId: 'height', type: 'decimal' },
    { linkId: 'weighed', type: 'boolean' },
    { linkId: 'weight', type: 'decimal', enableWhen: [{ question: 'weighed', operator: '=', answerBoolean: true }] },
    { linkId: 'bmi', type: 'decimal', extension: [calculated('weight / height.power(2)', 'bmi')] },
    { linkId: 'band', type: 'string', extension: [calculated('bmi-band')] },
  ]),
  url: URL,
};

const decimal = (value: number): readonly Answer[] => [{ kind: 'decimal', value }];
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: itemPath(path), answers });
const read = (projection: VisibleProjection, linkId: string): number | undefined => {
  const answer = projection.nodes.find((node) => node.item.linkId === linkId)?.answers[0];
  return answer?.kind === 'decimal' ? answer.value : undefined;
};
const valueOf = (session: Session, path: string): unknown => session.getSnapshot().nodes.find((node) => node.path === path)?.answers[0]?.value;

/** The test-only evaluator AC-07.3.2 asks for: it knows two expressions and nothing else. */
const stub: ExpressionEvaluator = {
  evaluate({ expression }, { projection }) {
    if (expression === 'bmi-band') {
      const bmi = read(projection, 'bmi');
      return bmi === undefined ? undefined : { kind: 'string', value: bmi >= 25 ? 'high' : 'normal' };
    }
    const height = read(projection, 'height');
    const weight = read(projection, 'weight');
    return height === undefined || weight === undefined ? undefined : { kind: 'decimal', value: Math.round((weight / height ** 2) * 10) / 10 };
  },
};

describe('the expression evaluator seam (US-07.3, ADR-0017, M4 plan D8)', () => {
  it('computes a value through a stub, in the same cycle as either input changes (AC-07.3.2)', () => {
    const session = createSession(BMI, { evaluator: stub });
    expect(session.diagnostics).toEqual([]);
    set(session, 'height', decimal(1.8));
    set(session, 'weighed', bool(true));
    const before = session.getSnapshot().cycle;
    set(session, 'weight', decimal(81));
    expect(session.getSnapshot().cycle).toBe(before + 1);
    expect(valueOf(session, 'bmi')).toBe(25);
    expect(session.getSnapshot().change?.responseChanged).toBe(true);
    set(session, 'height', decimal(2));
    expect(valueOf(session, 'bmi')).toBe(20.3);
  });

  it('gives an item the values of calculated items before it in the same cycle (ADR-0009 step 4, document order)', () => {
    const session = createSession(BMI, { evaluator: stub });
    set(session, 'height', decimal(1.8));
    set(session, 'weighed', bool(true));
    set(session, 'weight', decimal(90));
    expect(valueOf(session, 'band')).toBe('high');
    set(session, 'weight', decimal(60));
    expect(valueOf(session, 'band')).toBe('normal');
  });

  it('gives an item that reads a later calculated item the previous cycle\'s value, caught up by the next change (ADR-0009)', () => {
    const lagging: Questionnaire = questionnaire([
      { linkId: 'earlier', type: 'decimal', extension: [calculated('bmi-copy')] },
      ...(BMI.item ?? []),
      { linkId: 'note', type: 'string' },
    ]);
    const evaluator: ExpressionEvaluator = {
      evaluate: (expression, context) =>
        expression.expression === 'bmi-copy' ? (read(context.projection, 'bmi') === undefined ? undefined : { kind: 'decimal', value: read(context.projection, 'bmi') ?? 0 }) : stub.evaluate(expression, context),
    };
    const session = createSession(lagging, { evaluator });
    set(session, 'height', decimal(1.8));
    set(session, 'weighed', bool(true));
    set(session, 'weight', decimal(81));
    expect(valueOf(session, 'bmi')).toBe(25);
    expect(valueOf(session, 'earlier')).toBeUndefined();
    set(session, 'note', [{ kind: 'string', value: 'any later change' }]);
    expect(valueOf(session, 'earlier')).toBe(25);
  });

  it('emits a calculated value like an answer, and leaves it out when an input is hidden (ADR-0017 verification)', () => {
    const session = createSession(BMI, { evaluator: stub });
    set(session, 'height', decimal(1.8));
    set(session, 'weighed', bool(true));
    set(session, 'weight', decimal(81));
    const linkIds = () => (emitResponse(session).item as readonly { readonly linkId: string }[] | undefined)?.map((item) => item.linkId);
    expect(linkIds()).toEqual(['height', 'weighed', 'weight', 'bmi', 'band']);
    set(session, 'weighed', bool(false));
    expect(valueOf(session, 'bmi')).toBeUndefined();
    expect(linkIds()).toEqual(['height', 'weighed']);
  });

  it('passes the expression and its name, and the node path, and refuses direct answers (AC-07.3.3)', () => {
    const evaluate = vi.fn<ExpressionEvaluator['evaluate']>(() => undefined);
    const session = createSession(BMI, { evaluator: { evaluate } });
    expect(evaluate).toHaveBeenCalledWith({ language: 'text/fhirpath', expression: 'weight / height.power(2)', name: 'bmi' }, expect.objectContaining({ path: 'bmi' }));
    expect(evaluate).toHaveBeenCalledWith({ language: 'text/fhirpath', expression: 'bmi-band' }, expect.objectContaining({ path: 'band' }));
    expect(set(session, 'bmi', decimal(1))).toEqual({ outcome: 'refused', reason: 'node-calculated' });
  });

  it('re-runs only when answers or enablement changed (M4 plan D8)', () => {
    const evaluate = vi.fn<ExpressionEvaluator['evaluate']>((expression, context) => stub.evaluate(expression, context));
    const session = createSession(BMI, { evaluator: { evaluate } });
    evaluate.mockClear();
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('height') });
    session.dispatch({ type: 'RequestCompletion' });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('clears a value the evaluator throws on, reports the item once without the text, and keeps the form (AC-07.3.4, INV-X-09)', () => {
    const onCollaboratorError = vi.fn();
    let broken = false;
    const thrown = new Error('bmi of SENTINEL');
    const session = createSession(BMI, {
      onCollaboratorError,
      evaluator: {
        evaluate(expression, context) {
          if (broken && expression.name === 'bmi') throw thrown;
          return stub.evaluate(expression, context);
        },
      },
    });
    set(session, 'height', decimal(1.8));
    set(session, 'weighed', bool(true));
    set(session, 'weight', decimal(81));
    broken = true;
    expect(set(session, 'weight', decimal(90))).toEqual({ outcome: 'applied' });
    expect(valueOf(session, 'bmi')).toBeUndefined();
    expect(valueOf(session, 'band')).toBeUndefined();
    set(session, 'weight', decimal(95));
    const finding = { code: 'evaluator-threw', severity: 'warning', path: 'bmi', related: [], detail: null };
    expect(session.diagnostics).toEqual([finding]);
    expect(onCollaboratorError).toHaveBeenCalledWith(thrown, finding);
    expect(JSON.stringify(session.diagnostics)).not.toContain('SENTINEL');
    broken = false;
    set(session, 'weight', decimal(81));
    expect(valueOf(session, 'bmi')).toBe(25);
  });

  it.each([
    ['a kind the item cannot hold', { kind: 'string', value: 'SENTINEL' }],
    ['something that is not an answer', 'SENTINEL'],
    ['null', null],
  ])('clears %s and reports it with detail type (M4 plan D8)', (_, returned) => {
    const session = createSession(BMI, { evaluator: { evaluate: ({ name }) => (name === 'bmi' ? (returned as Answer) : undefined) } });
    expect(session.getSnapshot().nodes.find((node) => node.path === 'bmi')?.answers).toEqual([]);
    expect(session.diagnostics.map((finding) => [finding.code, finding.path, finding.detail])).toEqual([['evaluator-threw', 'bmi', 'type']]);
    expect(JSON.stringify(session.diagnostics)).not.toContain('SENTINEL');
  });

  it('hands the evaluator a frozen projection and refuses a command it sends (AC-4, AC-6)', () => {
    const box: { session?: Session } = {};
    const sent: unknown[] = [];
    box.session = createSession(BMI, {
      evaluator: {
        evaluate(_, { projection }) {
          sent.push(box.session?.dispatch({ type: 'SetAnswer', path: itemPath('height'), answers: decimal(3) }));
          (projection.nodes as unknown[]).push('tampered');
          return undefined;
        },
      },
    });
    sent.length = 0;
    set(box.session, 'height', decimal(1.8));
    // Called once per calculated item, and refused each time.
    expect(sent).toEqual([
      { outcome: 'refused', reason: 'collaborator-running' },
      { outcome: 'refused', reason: 'collaborator-running' },
    ]);
    expect(valueOf(box.session, 'height')).toBe(1.8);
    expect(box.session.diagnostics.map((finding) => finding.code)).toEqual(['evaluator-threw', 'evaluator-threw']);
  });

  it('raises no-evaluator only without one, and then the item has no value (INV-D-09, AC-07.3.1)', () => {
    const session = createSession(BMI);
    expect(session.diagnostics.map((finding) => [finding.code, finding.path])).toEqual([
      ['no-evaluator', 'bmi'],
      ['no-evaluator', 'band'],
    ]);
    set(session, 'height', decimal(1.8));
    expect(valueOf(session, 'bmi')).toBeUndefined();
  });

  it('keeps calculated values out of a snapshot and recomputes them on restore (M4 plan D8)', () => {
    const session = createSession(BMI, { evaluator: stub });
    set(session, 'height', decimal(1.8));
    set(session, 'weighed', bool(true));
    set(session, 'weight', decimal(81));
    const saved = snapshot(session);
    expect(Object.keys(saved['answers'] as object)).toEqual(['height', 'weighed', 'weight']);
    expect(valueOf(restoreSession(BMI, saved, { evaluator: stub }), 'bmi')).toBe(25);
    expect(valueOf(restoreSession(BMI, saved), 'bmi')).toBeUndefined();
  });

  it('replaces a stored calculated value on hydrate with an evaluator, and quarantines it without one (M4 plan D8)', () => {
    const stored: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      questionnaire: URL,
      item: [
        { linkId: 'height', answer: [{ valueDecimal: 1.8 }] },
        { linkId: 'weighed', answer: [{ valueBoolean: true }] },
        { linkId: 'weight', answer: [{ valueDecimal: 81 }] },
        { linkId: 'bmi', answer: [{ valueDecimal: 99 }] },
      ],
    };
    const hydrated = hydrateSession(BMI, stored, { evaluator: stub });
    expect(hydrated.diagnostics).toEqual([]);
    expect(valueOf(hydrated, 'bmi')).toBe(25);
    expect(hydrateSession(BMI, stored).diagnostics.map((finding) => [finding.code, finding.path, finding.detail])).toContainEqual(['quarantined-answer', 'bmi', 'calculated']);
  });
});
