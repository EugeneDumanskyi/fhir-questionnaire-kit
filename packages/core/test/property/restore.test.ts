import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createSession, emitResponse, type RetentionPolicy, type Session } from '../../src/index.js';
import { restoreSession, snapshot } from '../../src/resume.js';
import { commandSequences, drive, richQuestionnaires, toR4 } from './generate.js';

/**
 * M3 AC-2, INV-E-07, AC-05.3.1: `restore(snapshot(s))` is indistinguishable
 * from `s` — the same state, the same snapshot, the same response — and stays
 * so: the same commands afterwards give the same results and states,
 * retained answers, ordinals, positions and surfacing included.
 */
const RUNS = Number(process.env['FHIRQ_PROPERTY_RUNS'] ?? 300);
vi.setConfig({ testTimeout: 60_000 });

const state = (session: Session) => {
  const { status, cycle, nodes, issues, completionRefused } = session.getSnapshot();
  return { status, cycle, nodes, issues, completionRefused };
};

describe('restore from a snapshot (M3 AC-2, INV-E-07)', () => {
  it('is indistinguishable from the session it was taken from, before and after more commands', () => {
    fc.assert(
      fc.property(
        richQuestionnaires,
        fc.constantFrom<RetentionPolicy>('retain-exclude', 'discard'),
        commandSequences,
        commandSequences,
        fc.boolean(),
        ({ input, kinds }, retention, before, after, complete) => {
          const questionnaire = toR4(input, null);
          const session = createSession(questionnaire, { retention });
          drive(session, kinds, before);
          if (complete) session.dispatch({ type: 'RequestCompletion' });

          const restored = restoreSession(questionnaire, JSON.parse(JSON.stringify(snapshot(session))));
          expect(state(restored)).toEqual(state(session));
          expect(snapshot(restored)).toEqual(snapshot(session));
          expect(emitResponse(restored, { authored: '2026' })).toEqual(emitResponse(session, { authored: '2026' }));

          expect(drive(restored, kinds, after)).toEqual(drive(session, kinds, after));
          expect(state(restored)).toEqual(state(session));
          expect(snapshot(restored)).toEqual(snapshot(session));
        },
      ),
      { numRuns: RUNS },
    );
  });
});
