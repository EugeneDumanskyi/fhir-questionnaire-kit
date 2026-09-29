import { readFileSync } from 'node:fs';

import type { Questionnaire } from '@fhirq/core';

/*
 * The worked scoring example (M10 plan D8, fallback b): the demonstration
 * form's two-item wellbeing block (`fixtures/demo`), shaped like a two-item
 * screener in original wording. It is not the PHQ-2, and nothing here is for
 * clinical use.
 */
const questionnaire = JSON.parse(readFileSync(new URL('../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8')) as Questionnaire;

// #region table
interface ItemJson {
  readonly linkId: string;
  readonly item?: readonly ItemJson[];
  readonly answerOption?: readonly {
    readonly valueCoding?: { readonly code?: string; readonly extension?: readonly { readonly url: string; readonly valueDecimal?: number }[] };
  }[];
}

const ORDINAL = 'http://hl7.org/fhir/StructureDefinition/ordinalValue';
const flat = (items: readonly ItemJson[]): ItemJson[] => items.flatMap((item) => [item, ...flat(item.item ?? [])]);

/** Each named item's scores by answer code, read from its options' `ordinalValue`. */
function scoreTable(source: Questionnaire, linkIds: readonly string[]): Map<string, Map<string, number>> {
  const items = flat((source.item ?? []) as readonly ItemJson[]);
  return new Map(linkIds.map((linkId) => {
    const scores = new Map<string, number>();
    for (const { valueCoding } of items.find((item) => item.linkId === linkId)?.answerOption ?? []) {
      const score = valueCoding?.extension?.find((extension) => extension.url === ORDINAL)?.valueDecimal;
      if (valueCoding?.code !== undefined && score !== undefined) scores.set(valueCoding.code, score);
    }
    return [linkId, scores];
  }));
}
// #endregion

// #region scorer
import { createSession, type VisibleProjection } from '@fhirq/core';

const ITEMS = ['wellbeing-energy', 'wellbeing-sleep'];
const table = scoreTable(questionnaire, ITEMS);

/** The sum of the answers' scores, or `null` until every item has one: a partial sum is not a score. */
function total(projection: VisibleProjection): number | null {
  let sum = 0;
  for (const linkId of ITEMS) {
    const answer = projection.nodes.find((node) => node.item.linkId === linkId)?.answers[0];
    const code = answer?.kind === 'coding' ? answer.value.code : undefined;
    const score = code === undefined ? undefined : table.get(linkId)?.get(code);
    if (score === undefined) return null;
    sum += score;
  }
  return sum;
}

const session = createSession(questionnaire, { scorers: { wellbeing: { inputs: ITEMS, score: total } } });
// #endregion

export { session, table };
