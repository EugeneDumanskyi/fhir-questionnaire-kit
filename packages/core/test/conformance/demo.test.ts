import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { compile, type Definition } from '../../src/definition/compile.js';
import { parseQuestionnaire } from '../../src/fhir/r4/parse.js';
import { createSession, itemPath, type Answer, type Questionnaire, type SessionOptions, type VisibleProjection } from '../../src/index.js';

/**
 * The demo fixture (AC-15.1.1): `fixtures/demo` loads cleanly in strict mode
 * and carries every structure the demo is there to show. Version 1 (M2) held
 * the conditions, the repeat and the item types; version 2 (M4) adds the
 * scored block, and this test the cross-field rule a host registers with it.
 */

const json: unknown = JSON.parse(readFileSync(new URL('../../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8'));

function load(): Definition {
  const parsed = parseQuestionnaire(json);
  if (!parsed.ok) throw new Error(`demo does not parse: ${JSON.stringify(parsed.findings)}`);
  const compiled = compile(parsed.input, 'strict');
  if (!compiled.ok) throw new Error(`demo does not compile: ${JSON.stringify(compiled.findings)}`);
  return compiled.definition;
}

const ORDINAL = 'http://hl7.org/fhir/StructureDefinition/ordinalValue';

interface JsonItem {
  readonly linkId: string;
  readonly item?: readonly JsonItem[];
  readonly answerOption?: readonly { readonly valueCoding?: { readonly code?: string; readonly extension?: readonly { readonly url: string; readonly valueDecimal?: number }[] } }[];
}
const jsonItems = (list: readonly JsonItem[]): JsonItem[] => list.flatMap((item) => [item, ...jsonItems(item.item ?? [])]);

/** Each scored item's ordinals by code, from the registered `ordinalValue` extension: what a host's scorer reads. */
const ordinals = new Map(
  jsonItems((json as { item: readonly JsonItem[] }).item)
    .filter((item) => item.answerOption?.some((option) => option.valueCoding?.extension?.some((extension) => extension.url === ORDINAL)))
    .map((item) => [
      item.linkId,
      new Map(item.answerOption?.map((option) => [option.valueCoding?.code, option.valueCoding?.extension?.find((extension) => extension.url === ORDINAL)?.valueDecimal])),
    ]),
);

/** The host's test-only scorer: the sum of the ordinals, or `null` until every scored item is answered. */
const wellbeing = (projection: VisibleProjection): number | null => {
  let total = 0;
  for (const [linkId, byCode] of ordinals) {
    const answer = projection.nodes.find((node) => node.item.linkId === linkId)?.answers[0];
    const ordinal = answer?.kind === 'coding' ? byCode.get(answer.value.code) : undefined;
    if (ordinal === undefined) return null;
    total += ordinal;
  }
  return total;
};

/** The host's cross-field rule: a date stopped smoking cannot be after the appointment (same precision, so the strings compare). */
const stoppedBeforeVisit: NonNullable<SessionOptions['rules']>[number] = {
  inputs: ['smoking-stopped', 'visit-date'],
  targets: ['smoking-stopped'],
  check: ({ 'smoking-stopped': stopped, 'visit-date': visit }) => {
    const [a] = stopped ?? [];
    const [b] = visit ?? [];
    return a?.kind === 'date' && b?.kind === 'date' && a.value > b.value ? 'demo-stopped-after-visit' : null;
  },
};

describe('the demo fixture (AC-15.1.1)', () => {
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

  it('has a scored section: every option of each scored item carries an ordinal', () => {
    expect([...ordinals.keys()]).toEqual(['wellbeing-energy', 'wellbeing-sleep']);
    for (const [linkId, byCode] of ordinals) {
      expect([...byCode.values()].every((ordinal) => typeof ordinal === 'number'), linkId).toBe(true);
    }
  });

  it('scores the scored section through a host scorer', () => {
    const session = createSession(json as Questionnaire, { scorers: { wellbeing: { inputs: [...ordinals.keys()], score: wellbeing } } });
    const code = (value: string): readonly Answer[] => [{ kind: 'coding', value: { code: value } }];
    expect(session.getSnapshot().scores).toEqual({ wellbeing: null });
    session.dispatch({ type: 'SetAnswer', path: itemPath('wellbeing', 'wellbeing-energy'), answers: code('most-days') });
    session.dispatch({ type: 'SetAnswer', path: itemPath('wellbeing', 'wellbeing-sleep'), answers: code('some-days') });
    expect(session.getSnapshot().scores).toEqual({ wellbeing: 3 });
    expect(session.diagnostics).toEqual([]);
  });

  it('runs a cross-field rule a host registers', () => {
    const session = createSession(json as Questionnaire, { rules: [stoppedBeforeVisit] });
    const date = (value: string): readonly Answer[] => [{ kind: 'date', value }];
    session.dispatch({ type: 'SetAnswer', path: itemPath('visit', 'visit-date'), answers: date('2026-10-01') });
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoking', 'smoking-status'), answers: [{ kind: 'coding', value: { code: 'former' } }] });
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoking', 'smoking-stopped'), answers: date('2026-11-01') });
    const ruled = () => session.getSnapshot().issues.filter((issue) => issue.code === 'rule').map((issue) => [issue.path, issue.message]);
    expect(ruled()).toEqual([['smoking/smoking-stopped', 'demo-stopped-after-visit']]);
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoking', 'smoking-stopped'), answers: date('2020-01-01') });
    expect(ruled()).toEqual([]);
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
