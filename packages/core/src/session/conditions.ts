import type { Answer, Coding, Quantity } from '../kernel/answer.js';
import type { Operator } from '../kernel/item-type.js';
import { parseDate, parseDateTime, type PartialDate, type PartialDateTime } from '../kernel/temporal.js';
import { slot } from '../kernel/dense.js';
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

/** How an answer relates to the expected value. `unequal` is decided but unordered. */
export type Outcome = 'less' | 'equal' | 'greater' | 'unequal' | 'undecidable';

const SATISFIES: Readonly<Record<Exclude<Operator, 'exists' | '!='>, readonly Outcome[]>> = {
  '=': ['equal'],
  '>': ['greater'],
  '<': ['less'],
  '>=': ['greater', 'equal'],
  '<=': ['less', 'equal'],
};

type Comparators = { readonly [K in Answer['kind']]: (value: Extract<Answer, { kind: K }>['value'], expected: Answer) => Outcome };

/** By the answer's kind. A kind that differs from the expected one is decided `unequal`, never an error. */
const COMPARATORS: Comparators = {
  boolean: (value, expected) => (expected.kind === 'boolean' && value === expected.value ? 'equal' : 'unequal'),
  integer: (value, expected) => numeric(value, expected),
  decimal: (value, expected) => numeric(value, expected),
  date: (value, expected) => (expected.kind === 'date' ? compareDates(parseDate(value), parseDate(expected.value)) : 'unequal'),
  dateTime: (value, expected) =>
    expected.kind === 'dateTime' ? compareDateTimes(parseDateTime(value), parseDateTime(expected.value)) : 'unequal',
  string: (value, expected) => (expected.kind === 'string' && value === expected.value ? 'equal' : 'unequal'),
  coding: (value, expected) => (expected.kind === 'coding' && sameCode(value, expected.value) ? 'equal' : 'unequal'),
  quantity: (value, expected) => (expected.kind === 'quantity' ? compareQuantities(value, expected.value) : 'unequal'),
};

export function compare(answer: Answer, expected: Answer): Outcome {
  const comparator = COMPARATORS[answer.kind] as (value: Answer['value'], expected: Answer) => Outcome;
  return comparator(answer.value, expected);
}

/** Integers and decimals compare with each other by numeric value. */
function numeric(value: number, expected: Answer): Outcome {
  return expected.kind === 'integer' || expected.kind === 'decimal' ? order(value, expected.value) : 'unequal';
}

function order(a: number, b: number): Outcome {
  if (a === b) return 'equal';
  return a < b ? 'less' : 'greater';
}

/** Codings match on system and code; both must agree, including both being absent. `display` is ignored. */
function sameCode(a: Coding, b: Coding): boolean {
  return a.system === b.system && a.code === b.code;
}

/** Quantities compare only in the same system and code; there is no unit conversion (M2 plan D3). */
function compareQuantities(a: Quantity, b: Quantity): Outcome {
  if (a.system !== b.system || a.code !== b.code) return 'undecidable';
  return order(a.value, b.value);
}

/** Dates compare field by field, never through UTC, and only at the same precision. */
function compareDates(a: PartialDate | null, b: PartialDate | null): Outcome {
  if (a === null || b === null || a.precision !== b.precision) return 'undecidable';
  return lexicographic([a.year, a.month, a.day], [b.year, b.month, b.day]);
}

/**
 * Two `dateTime`s with a time compare as instants, each shifted by its own
 * offset; without a time they compare like dates. Different precision cannot
 * be decided.
 */
function compareDateTimes(a: PartialDateTime | null, b: PartialDateTime | null): Outcome {
  if (a === null || b === null || a.precision !== b.precision) return 'undecidable';
  if (a.precision !== 'time') return lexicographic([a.year, a.month, a.day], [b.year, b.month, b.day]);
  const seconds = order(epochSeconds(a), epochSeconds(b));
  return seconds === 'equal' ? compareFractions(a.fraction, b.fraction) : seconds;
}

function lexicographic(a: readonly number[], b: readonly number[]): Outcome {
  for (const [index, value] of a.entries()) {
    const outcome = order(value, slot(b, index));
    if (outcome !== 'equal') return outcome;
  }
  return 'equal';
}

function compareFractions(a: string, b: string): Outcome {
  const width = Math.max(a.length, b.length);
  const left = a.padEnd(width, '0');
  const right = b.padEnd(width, '0');
  if (left === right) return 'equal';
  return left < right ? 'less' : 'greater';
}

/** Seconds since 1970-01-01T00:00:00Z, by the civil-calendar day count, so no year is shifted by `Date`. */
function epochSeconds(value: PartialDateTime): number {
  const year = value.month <= 2 ? value.year - 1 : value.year;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (value.month + (value.month > 2 ? -3 : 9)) + 2) / 5) + value.day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  const days = era * 146_097 + dayOfEra - 719_468;
  return days * 86_400 + value.hour * 3_600 + value.minute * 60 + value.second - (value.offsetMinutes ?? 0) * 60;
}
