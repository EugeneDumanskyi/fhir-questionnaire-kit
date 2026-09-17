import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compile, type Definition } from '../../src/definition/compile.js';
import { parseQuestionnaire } from '../../src/fhir/r4/parse.js';
import { createSession, itemPath, type Questionnaire } from '../../src/index.js';

/**
 * Demo fixture v1 (M2 plan step 11, AC-15.1.1 in part): `fixtures/demo` loads
 * cleanly in strict mode and carries the structure the demo is there to show.
 * The cross-field rule (M3) and the scored block (M4) join it later.
 */

const json: unknown = JSON.parse(readFileSync(new URL('../../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8'));

function load(): Definition {
  const parsed = parseQuestionnaire(json);
  if (!parsed.ok) throw new Error(`demo does not parse: ${JSON.stringify(parsed.findings)}`);
  const compiled = compile(parsed.input, 'strict');
  if (!compiled.ok) throw new Error(`demo does not compile: ${JSON.stringify(compiled.findings)}`);
  return compiled.definition;
}

describe('the demo fixture, v1 (AC-15.1.1)', () => {
  const definition = load();
  const items = definition.items;

  it('loads in strict mode with no diagnostics', () => {
    expect(definition.diagnostics).toEqual([]);
  });

  it('says it is not for clinical use', () => {
    expect((json as { description: string }).description).toContain('Not for clinical use');
    expect(readFileSync(new URL('../../../../fixtures/demo/README.md', import.meta.url), 'utf8')).toContain('**Not for clinical use.**');
  });

  it('has a chain of conditions at least three deep', () => {
    const depth = new Map<number, number>();
    const chain = (id: number): number => {
      const known = depth.get(id);
      if (known !== undefined) return known;
      const questions = (items[id]?.conditions ?? []).flatMap((condition) => (condition.kind === 'test' ? [condition.question] : []));
      const result = questions.length === 0 ? 0 : 1 + Math.max(...questions.map(chain));
      depth.set(id, result);
      return result;
    };
    expect(Math.max(...items.map((item) => chain(item.id)))).toBeGreaterThanOrEqual(3);
  });

  it('has a repeating group with a condition that reads its own instance', () => {
    const scoped = items.filter((item) =>
      item.conditions.some((condition) => condition.kind === 'test' && item.repeatScope !== -1 && items[condition.question]?.repeatScope === item.repeatScope),
    );
    expect(scoped.map((item) => item.linkId)).toContain('medicine-how-often');
  });

  it('uses enableBehavior all and any', () => {
    const behaviours = new Set(items.filter((item) => item.conditions.length > 1).map((item) => item.behavior));
    expect([...behaviours].sort()).toEqual(['all', 'any']);
  });

  it('uses at least eight item types', () => {
    expect(new Set(items.map((item) => item.type)).size).toBeGreaterThanOrEqual(8);
  });

  it('collapses the pain chain in one cycle, and keeps medicine instances apart', () => {
    const session = createSession(json as Questionnaire);
    const shown = () => session.getSnapshot().nodes.map((node) => node.path as string);
    const at = (path: string) => itemPath(...path.split('/'));

    session.dispatch({ type: 'SetAnswer', path: at('pain/pain-now'), answers: [{ kind: 'boolean', value: true }] });
    session.dispatch({ type: 'SetAnswer', path: at('pain/pain-score'), answers: [{ kind: 'integer', value: 8 }] });
    session.dispatch({ type: 'SetAnswer', path: at('pain/pain-onset'), answers: [{ kind: 'dateTime', value: '2026-09-16T08:30:00+01:00' }] });
    expect(shown()).toEqual(expect.arrayContaining(['pain/pain-tell-reception', 'arrival-note']));

    const before = session.getSnapshot().cycle;
    session.dispatch({ type: 'SetAnswer', path: at('pain/pain-now'), answers: [{ kind: 'boolean', value: false }] });
    expect(session.getSnapshot().cycle).toBe(before + 1);
    expect(shown().filter((path) => path.startsWith('pain/'))).toEqual(['pain/pain-now']);
    expect(shown()).not.toContain('arrival-note');

    session.dispatch({ type: 'AddRepeatInstance', path: at('medicine') });
    const first = itemPath('medicine', 1, 'medicine-as-needed');
    session.dispatch({ type: 'SetAnswer', path: first, answers: [{ kind: 'boolean', value: false }] });
    expect(shown().filter((path) => path.endsWith('medicine-how-often'))).toEqual(['medicine[1]/medicine-how-often']);
  });
});
