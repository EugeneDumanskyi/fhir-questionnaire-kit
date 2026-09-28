import type { SessionOptions } from '@fhirq/core';

/**
 * What a host adds to the demo form: a scorer, a cross-field rule and the
 * rule's message. The kit runs them; it never interprets a score or writes a
 * message itself. The playground shows this file as written.
 */

type Scorers = NonNullable<SessionOptions['scorers']>;
type Rule = NonNullable<SessionOptions['rules']>[number];

/** What each answer to the wellbeing items is worth: the `ordinalValue` their options carry. */
export const WORTH: Readonly<Record<string, number>> = { never: 0, 'some-days': 1, 'most-days': 2, 'every-day': 3 };

/** The sum of the wellbeing answers, or `null` until both are answered. */
export const scorers: Scorers = {
  wellbeing: {
    inputs: ['wellbeing-energy', 'wellbeing-sleep'],
    score: (projection) => {
      let total = 0;
      for (const linkId of ['wellbeing-energy', 'wellbeing-sleep']) {
        const answer = projection.nodes.find((node) => node.item.linkId === linkId)?.answers[0];
        const worth = answer?.kind === 'coding' && answer.value.code !== undefined ? WORTH[answer.value.code] : undefined;
        if (worth === undefined) return null;
        total += worth;
      }
      return total;
    },
  },
};

/** A date stopped smoking cannot be after the appointment. Both are dates of the same precision, so the strings compare. */
export const rules: readonly Rule[] = [
  {
    inputs: ['smoking-stopped', 'visit-date'],
    targets: ['smoking-stopped'],
    check: ({ 'smoking-stopped': stopped, 'visit-date': visit }) => {
      const [a] = stopped ?? [];
      const [b] = visit ?? [];
      return a?.kind === 'date' && b?.kind === 'date' && a.value > b.value ? 'demo-stopped-after-visit' : null;
    },
  },
];

/** The rule's message, by the catalogue key it returns. */
export const messages = { 'demo-stopped-after-visit': 'The date you stopped cannot be after your appointment.' };
