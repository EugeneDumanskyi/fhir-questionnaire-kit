import type { Answer } from '../kernel/answer.js';
import { compare, type Outcome } from '../kernel/compare.js';
import type { Operator } from '../kernel/item-type.js';
import type { CompiledCondition, ItemDef } from '../definition/compile.js';

/**
 * `enableWhen` evaluation (US-02.1, M2 plan D2 and D3).
 *
 * A question is read only through `QuestionState`, and a disabled question
 * reads as unanswered (INV-S-04), so a retained answer can never satisfy a
 * condition. With several answers (a repeating question), `=` and the ordering
 * operators hold when **at least one** answer satisfies them, and `!=` holds
 * when **no** answer is equal, including when there are none: that is the R4
 * operator text, and it means a disabled question enables a `!=` dependent.
 * A comparison that cannot be decided (dates of different precision,
 * quantities in different units) makes the condition `false` whatever the
 * operator, which is the safe side.
 */

export interface QuestionState {
  /** Effectively enabled (INV-S-01). */
  readonly enabled: boolean;
  readonly answers: readonly Answer[];
}

/** The own condition of an item (INV-S-02), given how to read the questions it depends on. */
export function ownCondition(item: ItemDef, question: (id: number) => QuestionState): boolean {
  if (item.forcedDisabled) return false;
  if (item.conditions.length === 0) return true;
  const holds = (condition: CompiledCondition): boolean => {
    if (condition.kind === 'never') return false;
    const state = question(condition.question);
    return test(condition.operator, condition.answer, state.enabled ? state.answers : []);
  };
  return item.behavior === 'all' ? item.conditions.every(holds) : item.conditions.some(holds);
}

/**
 * One condition against a question's readable answers: `[]` when it is
 * unanswered or disabled.
 */
export function test(operator: Operator, expected: Answer, answers: readonly Answer[]): boolean {
  if (operator === 'exists') return (answers.length > 0) === (expected.kind === 'boolean' && expected.value);
  const outcomes = answers.map((answer) => compare(answer, expected));
  if (operator === '!=') return outcomes.every((outcome) => outcome === 'less' || outcome === 'greater' || outcome === 'unequal');
  return outcomes.some((outcome) => SATISFIES[operator].includes(outcome));
}

const SATISFIES: Readonly<Record<Exclude<Operator, 'exists' | '!='>, readonly Outcome[]>> = {
  '=': ['equal'],
  '>': ['greater'],
  '<': ['less'],
  '>=': ['greater', 'equal'],
  '<=': ['less', 'equal'],
};
