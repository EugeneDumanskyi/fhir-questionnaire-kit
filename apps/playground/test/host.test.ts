import { readFileSync } from 'node:fs';

import { createSession, itemPath, type Answer, type Questionnaire } from '@fhirq/core';
import { describe, expect, it } from 'vitest';

import { messages, rules, scorers, WORTH } from '../src/host.js';

/** The host code the first screen runs and shows (M9 step 5), on the demo fixture it is written for. */

const demo = JSON.parse(readFileSync(new URL('../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8')) as Questionnaire;

const ORDINAL = 'http://hl7.org/fhir/StructureDefinition/ordinalValue';

interface JsonItem {
  readonly linkId: string;
  readonly item?: readonly JsonItem[];
  readonly answerOption?: readonly { readonly valueCoding?: { readonly code?: string; readonly extension?: readonly { readonly url: string; readonly valueDecimal?: number }[] } }[];
}
const flat = (list: readonly JsonItem[]): JsonItem[] => list.flatMap((item) => [item, ...flat(item.item ?? [])]);

const code = (value: string): readonly Answer[] => [{ kind: 'coding', value: { code: value } }];
const date = (value: string): readonly Answer[] => [{ kind: 'date', value }];

describe('the host code on the demo', () => {
  it('scores with the ordinals the fixture carries', () => {
    const scored = flat((demo as { item: readonly JsonItem[] }).item).filter((item) => (scorers['wellbeing']?.inputs ?? []).includes(item.linkId));
    expect(scored).toHaveLength(2);
    for (const item of scored) {
      const ordinals: Record<string, number | undefined> = {};
      for (const { valueCoding } of item.answerOption ?? []) ordinals[valueCoding?.code ?? ''] = valueCoding?.extension?.find((extension) => extension.url === ORDINAL)?.valueDecimal;
      expect(ordinals, item.linkId).toEqual(WORTH);
    }
  });

  it('scores once both wellbeing items are answered', () => {
    const session = createSession(demo, { scorers, rules });
    expect(session.getSnapshot().scores).toEqual({ wellbeing: null });
    session.dispatch({ type: 'SetAnswer', path: itemPath('wellbeing', 'wellbeing-energy'), answers: code('most-days') });
    expect(session.getSnapshot().scores).toEqual({ wellbeing: null });
    session.dispatch({ type: 'SetAnswer', path: itemPath('wellbeing', 'wellbeing-sleep'), answers: code('some-days') });
    expect(session.getSnapshot().scores).toEqual({ wellbeing: 3 });
    expect(session.diagnostics).toEqual([]);
  });

  it('flags a stop date after the appointment, with a message for its key', () => {
    const session = createSession(demo, { scorers, rules });
    session.dispatch({ type: 'SetAnswer', path: itemPath('visit', 'visit-date'), answers: date('2026-10-01') });
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoking', 'smoking-status'), answers: code('former') });
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoking', 'smoking-stopped'), answers: date('2026-11-01') });
    const ruled = () => session.getSnapshot().issues.filter((issue) => issue.code === 'rule').map((issue) => [issue.path, issue.message]);
    expect(ruled()).toEqual([['smoking/smoking-stopped', 'demo-stopped-after-visit']]);
    expect(Object.keys(messages)).toEqual(['demo-stopped-after-visit']);
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoking', 'smoking-stopped'), answers: date('2020-01-01') });
    expect(ruled()).toEqual([]);
  });
});
