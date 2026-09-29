# Scoring: a worked example

The kit does not score instruments. It gives a **scorer** of yours the
visible answers each time one of its questions changes, and keeps whatever
you return in `scores`, uninterpreted
([ADR-0006](../adr/0006-failing-scorers-degrade-like-rules.md)). The scoring
rules are yours, from the instrument's own manual.

> **Not a medical device.** This example shows the mechanism, on a
> demonstration block. It is not a validated instrument, and a score here
> means nothing clinically. Validating a scorer against its instrument is
> the adopter's responsibility.

## The block

The demonstration form, [`fixtures/demo`](../../fixtures/demo), has a
two-item block, `wellbeing`, shaped like a two-item screener: two questions
on the last two weeks, each answered on a four-point scale. Its wording is
original; it is not the PHQ-2. Each option carries its score through the
registered HL7 extension
[`ordinalValue`](https://hl7.org/fhir/R4/extension-ordinalvalue.html):

| Code | Shown as | Score |
|---|---|---|
| `never` | Not at all | 0 |
| `some-days` | On some days | 1 |
| `most-days` | On most days | 2 |
| `every-day` | Every day or almost | 3 |

## The scoring table

An answer arrives as a `coding`: a code, not a score. So first read each
option's score from the questionnaire:

<!-- snippet: docs/examples/src/scoring.ts#table -->
```ts
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
```

If your copy of an instrument carries no `ordinalValue`, write the table by
hand from its manual. Either way, it is data you can review against the
source.

## The scorer

<!-- snippet: docs/examples/src/scoring.ts#scorer -->
```ts
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
```

- **`inputs`** names the questions the scorer reads, by `linkId`. It runs
  when one of them, or its answer, changes, and not otherwise.
- **The projection** holds only the enabled questions and their answers. An
  answer to a hidden question is never in it.
- **`null` until complete.** Returning a sum of the questions answered so far
  would show a score for an unfinished screener. What an incomplete
  instrument scores is your rule to write, not the kit's.
- **The result** is in `session.getSnapshot().scores.wellbeing`. It is not in
  the emitted response and not in a snapshot: it is recomputed on restore.
  Storing it, as an `Observation` for instance, is yours.
- **A scorer that throws** gives `null` and a `scorer-threw` diagnostic, and
  the form stays usable.

## Published instruments

Instruments such as the PHQ-9 and the GAD-7 score the same way: a sum of
per-option scores, with rules of their own for missing answers and for what
a total means. The kit ships no copy of a published instrument. To use one,
take a FHIR copy whose terms allow it, check its scores against the
instrument's manual, and write its scorer as above.

The test that holds this example to its behaviour is
[`docs/examples/test/examples.test.ts`](../examples/test/examples.test.ts).
