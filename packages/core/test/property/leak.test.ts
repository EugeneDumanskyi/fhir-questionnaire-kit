import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSession, emitResponse, FhirqError, type Answer, type QuestionnaireResponse, type SessionChange } from '../../src/index.js';
import { hydrateSession, restoreSession, snapshot } from '../../src/resume.js';
import { commandSequences, drive, linkIdOf, richQuestionnaires, toR4 } from './generate.js';

/**
 * NFR-X-04, INV-S-35, INV-D-10, INV-E-09: an answer value leaves the library
 * only through the emitted response and the snapshot. Every string answer here
 * carries a sentinel; none may appear in a diagnostic, an error, a change
 * event, an issue, or on the console — through ordinary use, a throwing rule,
 * and a hydration that rejects every stored answer it is given.
 */
const RUNS = Number(process.env['FHIRQ_PROPERTY_RUNS'] ?? 200);
vi.setConfig({ testTimeout: 60_000 });

const SENTINEL = 'SENTINEL-7f3a';
const withSentinel = (answers: Answer[]): Answer[] =>
  answers.map((answer) => (answer.kind === 'string' ? { kind: 'string', value: `${SENTINEL}-${answer.value}` } : answer));

/**
 * Every answer made unloadable, in a way that still carries the sentinel: a
 * wrong type, a malformed value, or an orphan. Only values carry it: a
 * `linkId` or a canonical is authored, and diagnostics name those (INV-E-09).
 */
function spoil(response: QuestionnaireResponse): unknown {
  let turn = 0;
  const visit = (item: Record<string, unknown>): Record<string, unknown> => {
    turn += 1;
    const answers = Array.isArray(item['answer']) ? item['answer'] : undefined;
    const spoiled =
      answers === undefined
        ? {}
        : { answer: answers.map(() => (turn % 3 === 0 ? { valueBoolean: SENTINEL } : turn % 3 === 1 ? { valueTime: SENTINEL } : { valueReference: { display: SENTINEL } })) };
    const children = Array.isArray(item['item']) ? { item: (item['item'] as Record<string, unknown>[]).map(visit) } : {};
    return { ...item, ...spoiled, ...children, ...(turn % 4 === 0 ? { linkId: `${String(item['linkId'])}-gone` } : {}) };
  };
  return { ...response, questionnaire: 'urn:other|1', item: (response.item as Record<string, unknown>[] | undefined)?.map(visit) ?? [] };
}

describe('no answer value outside the response and the snapshot (NFR-X-04)', () => {
  const console_ = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method));
  afterEach(() => {
    for (const spy of console_) expect(spy).not.toHaveBeenCalled();
  });

  it('keeps sentinels out of diagnostics, errors, events and issues', () => {
    fc.assert(
      fc.property(richQuestionnaires, commandSequences, ({ input, kinds }, sequence) => {
        const questionnaire = toR4(input);
        const stringItems = kinds.flatMap((kind, index) => (kind === 'string' || kind === 'strings' ? [linkIdOf(index)] : []));
        const rules = stringItems.slice(0, 1).map((linkId) => ({
          inputs: [linkId],
          check: (answers: Readonly<Record<string, readonly Answer[]>>): string | null => {
            const [first] = answers[linkId] ?? [];
            if (first?.kind === 'string' && first.value.endsWith('b')) throw new Error(first.value);
            return first === undefined ? null : 'rule-message';
          },
        }));
        const session = createSession(questionnaire, { rules });
        const events: SessionChange[] = [];
        session.subscribe((change) => events.push(change));
        drive(session, kinds, sequence, withSentinel);
        session.dispatch({ type: 'RequestCompletion' });

        const hydrated = hydrateSession(questionnaire, spoil(emitResponse(session)) as QuestionnaireResponse);
        const errors: unknown[] = [];
        for (const attempt of [
          () => restoreSession(questionnaire, { ...snapshot(session), answers: { nowhere: [{ kind: 'string', value: SENTINEL }] } }),
          () => restoreSession(questionnaire, { ...snapshot(session), answers: { [linkIdOf(0)]: [{ kind: 'boolean', value: SENTINEL }] } }),
          () => hydrateSession(questionnaire, { resourceType: 'QuestionnaireResponse', item: [{ linkId: 'x', answer: SENTINEL }] } as unknown as QuestionnaireResponse),
        ]) {
          try {
            attempt();
          } catch (error) {
            errors.push(error instanceof FhirqError ? { code: error.code, message: error.message, findings: error.findings } : String(error));
          }
        }

        const outside = JSON.stringify({ events, diagnostics: session.diagnostics, issues: session.getSnapshot().issues, hydrated: hydrated.diagnostics, errors });
        expect(outside).not.toContain(SENTINEL);
        expect(errors).toHaveLength(3);
      }),
      { numRuns: RUNS },
    );
  });

  it('does let the value through the two doors that are for it', () => {
    const session = createSession(toR4({ url: null, version: null, expressions: [], items: [] }));
    expect(JSON.stringify(emitResponse(session))).not.toContain(SENTINEL);
    const answered = createSession({ resourceType: 'Questionnaire', status: 'active', item: [{ linkId: 'q', type: 'string' }] });
    answered.dispatch({ type: 'SetAnswer', path: answered.getSnapshot().nodes[0]?.path ?? ('q' as never), answers: [{ kind: 'string', value: SENTINEL }] });
    expect(JSON.stringify(emitResponse(answered))).toContain(SENTINEL);
    expect(JSON.stringify(snapshot(answered))).toContain(SENTINEL);
  });
});
