import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/definition/compile.js';
import { parseQuestionnaire } from '../../src/fhir/r4/parse.js';
import type { Command, ItemPath } from '../../src/index.js';
import { createResponseSession } from '../../src/session/session.js';
import { recomputeTrace } from '../../src/session/trace.js';
import { validateRequired } from '../../src/validation/required.js';
import { expectedRecompute } from '../bfs.js';
import { Oracle, type ModelCommand } from '../oracle.js';

/**
 * M2 AC-5 at the NFR-P-04 ceiling (NFR-P-09, INV-S-07): the synthetic fixture
 * from `fixtures/bench/ceiling.json` (1,000 items, 500 conditions, a 20-item
 * repeating group at 50 instances, nesting 10, a chain of 10), driven by
 * commands that reach each kind of edge. After each one the trace equals the
 * independent pruned BFS, lies inside the scoped closure, and the state equals
 * the oracle's. The recompute set stays a small fraction of the ~2,000 nodes.
 */

const fixture = JSON.parse(readFileSync(new URL('../../../../fixtures/bench/ceiling.json', import.meta.url), 'utf8')) as unknown;
const yes = [{ kind: 'boolean', value: true }] as const;
const no = [{ kind: 'boolean', value: false }] as const;

describe('the recompute set at the scale ceiling (M2 AC-5)', () => {
  it('equals the independent BFS for chain, gate, per-instance and structural changes', () => {
    const parsed = parseQuestionnaire(fixture);
    if (!parsed.ok) throw new Error('ceiling fixture does not parse');
    const compiled = compile(parsed.input, 'strict');
    if (!compiled.ok) throw new Error('ceiling fixture does not compile');
    const session = createResponseSession(compiled.definition, { retention: 'retain-exclude', hostIdentity: null }, validateRequired);
    const oracle = new Oracle(parsed.input, 'retain-exclude');

    for (let i = 0; i < 49; i += 1) session.dispatch({ type: 'AddRepeatInstance', path: 'visit' as ItemPath });
    oracle.instances.set('visit', { ordinals: Array.from({ length: 50 }, (_, ordinal) => ordinal), next: 50 });
    const total = oracle.tree().order.length;
    expect(total).toBe(1_980);

    const commands: ModelCommand[] = [
      ...Array.from({ length: 10 }, (_, link) => ({ type: 'SetAnswer', path: `chain-${link + 1}`, answers: yes }) as const),
      { type: 'SetAnswer', path: 'chain-1', answers: no },
      { type: 'SetAnswer', path: 'gate-7', answers: yes },
      { type: 'SetAnswer', path: 'visit[31]/visit-4', answers: yes },
      { type: 'AddRepeatInstance', path: 'visit' },
      { type: 'RemoveRepeatInstance', path: 'visit', ordinal: 12 },
      { type: 'ClearAnswer', path: 'gate-7' },
    ];
    let largest = 0;
    for (const command of commands) {
      const before = oracle.evaluate();
      const answersBefore = JSON.stringify(oracle.answers.get(command.path) ?? []);
      expect(session.dispatch({ ...command, path: command.path as ItemPath } as Command)).toEqual(oracle.dispatch(command));
      const after = oracle.evaluate();
      const changed = JSON.stringify(oracle.answers.get(command.path) ?? []) !== answersBefore;
      const { pruned, closure } = expectedRecompute(oracle, command, changed, before, after);
      const trace = recomputeTrace(session);
      expect(trace.every((path) => closure.has(path))).toBe(true);
      expect([...trace].sort()).toEqual([...pruned].sort());
      largest = Math.max(largest, trace.length);
    }
    expect(session.getSnapshot().nodes.map((node) => node.path)).toEqual(oracle.visible().map((node) => node.path));
    // Sub-linear: the largest recompute set is the chain collapse, not the form.
    expect(largest).toBeLessThan(total / 50);
  });
});
