import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createSession, emitResponse, type QuestionnaireResponse, type RetentionPolicy } from '../../src/index.js';
import { hydrateSession, snapshot } from '../../src/resume.js';
import { commandSequences, drive, richQuestionnaires, toR4 } from './generate.js';

/**
 * M3 AC-1, INV-E-06, NFR-Q-06: `emit(hydrate(emit(s))) = emit(s)`, ignoring
 * `authored` and `status`, over at least 1,000 generated sessions per run:
 * every answer kind, repeating questions, nested repeats, retained answers,
 * both retention policies, host identity, completed sessions. A failure prints
 * fast-check's seed and the shrunk counterexample.
 *
 * Under mutation testing `FHIRQ_PROPERTY_RUNS` lowers the count, as for the M2
 * properties; the full count is the gate on the code as written.
 */
const RUNS = Number(process.env['FHIRQ_PROPERTY_RUNS'] ?? 1000);
vi.setConfig({ testTimeout: 60_000 });

const AUTHORED = '2026-09-18T10:00:00+02:00';
const HYDRATION = new Set(['version-drift', 'orphan-answer', 'quarantined-answer', 'hydrated-answer-disabled']);
const IDENTITY = { subject: { reference: 'Patient/1' }, identifier: { system: 'urn:fhirq:test', value: 'r-1' } };

/** What a case exercised, so a generator that stopped producing it fails here rather than passing vacuously. */
const FEATURES = {
  retained: (_: QuestionnaireResponse, retained: boolean) => retained,
  'second instance': (response: QuestionnaireResponse) => /"linkId":"(q\d+)".*"linkId":"\1"/.test(JSON.stringify(response)),
  'nested items': (response: QuestionnaireResponse) => JSON.stringify(response).includes('"item":[{"linkId":"q') && /"item":\[\{"linkId":"q\d+","item"/.test(JSON.stringify(response)),
  boolean: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueBoolean'),
  integer: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueInteger'),
  decimal: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueDecimal'),
  date: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueDate"'),
  'dateTime with an offset': (response: QuestionnaireResponse) => /valueDateTime":"[^"]+[+-]\d\d:\d\d"/.test(JSON.stringify(response)),
  string: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueString'),
  coding: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueCoding'),
  quantity: (response: QuestionnaireResponse) => JSON.stringify(response).includes('valueQuantity'),
  'several answers': (response: QuestionnaireResponse) => /"answer":\[\{[^\]]*\},\{/.test(JSON.stringify(response)),
} as const;

describe('the round trip through an emitted response (M3 AC-1, INV-E-06)', () => {
  it(`re-emits what it hydrated, over ${RUNS} generated sessions`, () => {
    const seen = Object.fromEntries(Object.keys(FEATURES).map((name) => [name, 0])) as Record<keyof typeof FEATURES, number>;
    let cases = 0;
    fc.assert(
      fc.property(
        richQuestionnaires,
        fc.constantFrom<RetentionPolicy>('retain-exclude', 'discard'),
        commandSequences,
        fc.boolean(),
        fc.boolean(),
        ({ input, kinds }, retention, sequence, identity, complete) => {
          cases += 1;
          const questionnaire = toR4(input);
          const session = createSession(questionnaire, { retention, ...(identity ? { hostIdentity: IDENTITY } : {}) });
          drive(session, kinds, sequence);
          if (complete) session.dispatch({ type: 'RequestCompletion' });
          const emitted = emitResponse(session, { authored: AUTHORED });

          // Through JSON text, as a host stores it.
          const hydrated = hydrateSession(questionnaire, JSON.parse(JSON.stringify(emitted)) as QuestionnaireResponse);
          expect(hydrated.diagnostics.filter((finding) => HYDRATION.has(finding.code))).toEqual([]);
          expect(hydrated.getSnapshot().status).toBe('in-progress');
          expect({ ...emitResponse(hydrated, { authored: AUTHORED }), status: emitted.status }).toEqual(emitted);

          const shown = new Set(session.getSnapshot().nodes.map((node) => node.path as string));
          const retained = Object.keys(snapshot(session)['answers'] as object).some((path) => !shown.has(path));
          for (const [name, test] of Object.entries(FEATURES)) if (test(emitted, retained)) seen[name as keyof typeof FEATURES] += 1;
        },
      ),
      { numRuns: RUNS },
    );
    expect(cases).toBeGreaterThanOrEqual(RUNS);
    // Each feature in at least 2 % of cases: the thinnest, retained answers, runs at about 5 %.
    if (RUNS >= 1000) for (const [name, count] of Object.entries(seen)) expect(count, name).toBeGreaterThanOrEqual(RUNS * 0.02);
  });
});
