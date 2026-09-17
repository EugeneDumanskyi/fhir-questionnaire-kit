import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/definition/compile.js';
import type { Command, ItemPath } from '../../src/index.js';
import type { DefinitionInput } from '../../src/kernel/input.js';
import { createResponseSession, type Session } from '../../src/session/session.js';
import { recomputeTrace } from '../../src/session/trace.js';
import { validateRequired } from '../../src/validation/required.js';
import { expectedRecompute } from '../bfs.js';
import { Oracle, type ModelCommand, type Retention } from '../oracle.js';
import { commandSequences, concretise, questionnaires, shuffled } from './generate.js';

/**
 * M2 AC-4 and AC-5 over generated questionnaires and command sequences
 * (ADR-0009 verification, INV-S-06, INV-S-07, ADR-0002). A failure prints
 * fast-check's seed and the shrunk counterexample, which replays with
 * `{ seed, path }`.
 */

/**
 * 300 cases each in the suite. Under mutation testing every surviving mutant
 * reruns these, so `stryker.vitest.config.ts` lowers the count: a handful of
 * cases already kills what these properties can kill, and the full count
 * stays the gate on the code as written (spike S2).
 */
const RUNS = Number(process.env['FHIRQ_PROPERTY_RUNS'] ?? 300);
const retention = fc.constantFrom<Retention>('retain-exclude', 'discard');

function start(input: DefinitionInput, policy: Retention): Session {
  const compiled = compile(input, 'strict');
  if (!compiled.ok) throw new Error(`generator produced a rejected questionnaire: ${JSON.stringify(compiled.findings)}`);
  return createResponseSession(compiled.definition, { retention: policy, hostIdentity: null }, validateRequired);
}

const snapshot = (session: Session) =>
  session.getSnapshot().nodes.map((node) => ({ path: node.path as string, answers: node.answers, instances: node.instances }));

const asCommand = (command: ModelCommand) => ({ ...command, path: command.path as ItemPath }) as Command;

describe('incremental settle equals a from-scratch evaluation (M2 AC-4, ADR-0009)', () => {
  it('after every command, in both retention policies, with the same outcome', () => {
    fc.assert(
      fc.property(questionnaires, retention, commandSequences, ({ input, kinds }, policy, sequence) => {
        const session = start(input, policy);
        const oracle = new Oracle(input, policy);
        expect(snapshot(session)).toEqual(oracle.visible());

        for (const abstract of sequence) {
          const command = concretise(abstract, kinds, oracle);
          if (command === null) continue;
          const expected = oracle.dispatch(command);
          const actual = session.dispatch(asCommand(command));
          expect(actual).toEqual(expected);
          expect(snapshot(session)).toEqual(oracle.visible());
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('does not depend on declaration order (INV-S-06)', () => {
    fc.assert(
      fc.property(questionnaires, retention, commandSequences, fc.nat(), ({ input, kinds }, policy, sequence, seed) => {
        const original = start(input, policy);
        const reordered = start(shuffled(input, seed), policy);
        const oracle = new Oracle(input, policy);
        const byPath = (session: Session) => new Map(snapshot(session).map((node) => [node.path, node]));

        for (const abstract of sequence) {
          const command = concretise(abstract, kinds, oracle);
          if (command === null) continue;
          oracle.dispatch(command);
          expect(reordered.dispatch(asCommand(command))).toEqual(original.dispatch(asCommand(command)));
          expect(byPath(reordered)).toEqual(byPath(original));
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('never changes a retained answer while it is hidden (ADR-0002, INV-S-12)', () => {
    fc.assert(
      fc.property(questionnaires, commandSequences, ({ input, kinds }, sequence) => {
        const session = start(input, 'retain-exclude');
        const oracle = new Oracle(input, 'retain-exclude');
        const lastShown = new Map<string, unknown>();
        const hidden = new Set<string>();

        for (const abstract of sequence) {
          const command = concretise(abstract, kinds, oracle);
          if (command === null) continue;
          oracle.dispatch(command);
          session.dispatch(asCommand(command));
          const shown = new Map(snapshot(session).map((node) => [node.path, node.answers]));
          for (const [path, answers] of lastShown) {
            if (!shown.has(path)) hidden.add(path);
            else if (hidden.has(path)) {
              // Hidden since it was last shown, and back: its answers are exactly what they were,
              // unless its instance was removed in between, which destroys rather than retains.
              if (oracle.tree().nodes.has(path)) expect(shown.get(path)).toEqual(answers);
              hidden.delete(path);
            }
          }
          for (const [path, answers] of shown) lastShown.set(path, answers);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe('the recompute set (M2 AC-5, NFR-P-09, ADR-0009 as amended by plan D15)', () => {
  it('is inside the scoped closure, and equals an independent pruned BFS, after every applied command', () => {
    fc.assert(
      fc.property(questionnaires, retention, commandSequences, ({ input, kinds }, policy, sequence) => {
        const session = start(input, policy);
        const oracle = new Oracle(input, policy);

        for (const abstract of sequence) {
          const command = concretise(abstract, kinds, oracle);
          if (command === null) continue;
          const before = oracle.evaluate();
          const answersBefore = JSON.stringify(oracle.answers.get(command.path) ?? []);
          const outcome = oracle.dispatch(command);
          session.dispatch(asCommand(command));
          if (outcome.outcome === 'refused') continue;

          const after = oracle.evaluate();
          const changed = JSON.stringify(oracle.answers.get(command.path) ?? []) !== answersBefore;
          const { pruned, closure } = expectedRecompute(oracle, command, changed, before, after);
          const trace = [...recomputeTrace(session)];
          expect(new Set(trace).size).toBe(trace.length);
          expect(trace.every((path) => closure.has(path))).toBe(true);
          expect([...trace].sort()).toEqual([...pruned].sort());
        }
      }),
      { numRuns: RUNS },
    );
  });
});
