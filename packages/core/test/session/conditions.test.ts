import { describe, expect, it } from 'vitest';

import { COMPARABLE } from '../../src/definition/checks.js';
import { compile, type ItemDef } from '../../src/definition/compile.js';
import type { Answer } from '../../src/kernel/answer.js';
import { ITEM_TYPES, type ItemType, type Operator } from '../../src/kernel/item-type.js';
import { compare, ownCondition, test as holds, type QuestionState } from '../../src/session/conditions.js';
import { definition, item, when, yes } from '../definition/input.js';

/**
 * AC-02.1.3 and NFR-Q-05: every supported operator × question-type pair has a
 * named test, and a final test proves there are no gaps against the load-time
 * table (M2 plan D3). Each row is one question state: its answers, and whether
 * the question is enabled. A disabled question's answers are retained answers,
 * which must never count (INV-S-04, T4).
 */

type Row = readonly [label: string, expected: Answer, answers: readonly Answer[], enabled: boolean, result: boolean];

const b = (value: boolean): Answer => ({ kind: 'boolean', value });
const int = (value: number): Answer => ({ kind: 'integer', value });
const dec = (value: number): Answer => ({ kind: 'decimal', value });
const date = (value: string): Answer => ({ kind: 'date', value });
const dt = (value: string): Answer => ({ kind: 'dateTime', value });
const str = (value: string): Answer => ({ kind: 'string', value });
const code = (value: { system?: string; code?: string; display?: string }): Answer => ({ kind: 'coding', value });
const qty = (value: number, unit = 'kg'): Answer => ({ kind: 'quantity', value: { value, system: 'http://unitsofmeasure.org', code: unit } });

const CODE = code({ system: 'urn:smoking', code: 'daily' });

/** The rows every answerable type gets for `exists`. */
const existsRows = (sample: Answer): Row[] => [
  ['exists true, answered', yes, [sample], true, true],
  ['exists true, unanswered', yes, [], true, false],
  ['exists true, answer retained on a disabled question', yes, [sample], false, false],
  ['exists false, unanswered', b(false), [], true, true],
  ['exists false, answered', b(false), [sample], true, false],
  ['exists false, disabled with a retained answer', b(false), [sample], false, true],
];

/** `=` and `!=` share the same states, with results that mirror each other exactly when the comparison is decidable. */
const equalityRows = (expected: Answer, equal: Answer, other: Answer): { '=': Row[]; '!=': Row[] } => ({
  '=': [
    ['equal answer', expected, [equal], true, true],
    ['different answer', expected, [other], true, false],
    ['one of several answers equal', expected, [other, equal], true, true],
    ['unanswered', expected, [], true, false],
    ['equal answer retained on a disabled question', expected, [equal], false, false],
  ],
  '!=': [
    ['equal answer', expected, [equal], true, false],
    ['different answer', expected, [other], true, true],
    ['one of several answers equal', expected, [other, equal], true, false],
    ['unanswered: no answer is equal (R4 operator text, plan D2)', expected, [], true, true],
    ['equal answer retained on a disabled question counts as unanswered', expected, [equal], false, true],
  ],
});

const orderingRows = (expected: Answer, less: Answer, equal: Answer, greater: Answer): Record<'>' | '<' | '>=' | '<=', Row[]> => ({
  '>': [
    ['greater', expected, [greater], true, true],
    ['equal', expected, [equal], true, false],
    ['less', expected, [less], true, false],
    ['one of several greater', expected, [less, greater], true, true],
    ['unanswered', expected, [], true, false],
    ['greater answer retained on a disabled question', expected, [greater], false, false],
  ],
  '<': [
    ['less', expected, [less], true, true],
    ['equal', expected, [equal], true, false],
    ['greater', expected, [greater], true, false],
    ['unanswered', expected, [], true, false],
    ['less answer retained on a disabled question', expected, [less], false, false],
  ],
  '>=': [
    ['equal', expected, [equal], true, true],
    ['greater', expected, [greater], true, true],
    ['less', expected, [less], true, false],
    ['unanswered', expected, [], true, false],
  ],
  '<=': [
    ['equal', expected, [equal], true, true],
    ['less', expected, [less], true, true],
    ['greater', expected, [greater], true, false],
    ['unanswered', expected, [], true, false],
  ],
});

const ordered = (expected: Answer, less: Answer, equal: Answer, greater: Answer, extra: Partial<Record<Operator, Row[]>> = {}) => {
  const eq = equalityRows(expected, equal, greater);
  const ord = orderingRows(expected, less, equal, greater);
  return {
    exists: existsRows(equal),
    '=': [...eq['='], ...(extra['='] ?? [])],
    '!=': [...eq['!='], ...(extra['!='] ?? [])],
    '>': [...ord['>'], ...(extra['>'] ?? [])],
    '<': [...ord['<'], ...(extra['<'] ?? [])],
    '>=': [...ord['>='], ...(extra['>='] ?? [])],
    '<=': [...ord['<='], ...(extra['<='] ?? [])],
  };
};

const unordered = (expected: Answer, equal: Answer, other: Answer, extra: Partial<Record<Operator, Row[]>> = {}) => {
  const eq = equalityRows(expected, equal, other);
  return { exists: existsRows(equal), '=': [...eq['='], ...(extra['='] ?? [])], '!=': [...eq['!='], ...(extra['!='] ?? [])] };
};

const CASES: Readonly<Partial<Record<ItemType, Partial<Record<Operator, readonly Row[]>>>>> = {
  boolean: unordered(b(true), b(true), b(false)),
  integer: ordered(int(5), int(4), int(5), int(6), {
    '=': [['a decimal expected value compares numerically', dec(5), [int(5)], true, true]],
    '>': [['a decimal expected value compares numerically', dec(4.5), [int(5)], true, true]],
  }),
  decimal: ordered(dec(2.5), dec(2.4), dec(2.5), dec(2.6), {
    '<': [['an integer expected value compares numerically', int(3), [dec(2.5)], true, true]],
    '!=': [['an integer expected value equal by value', int(2), [dec(2)], true, false]],
  }),
  date: ordered(date('2024-05-01'), date('2024-04-30'), date('2024-05-01'), date('2024-05-02'), {
    '=': [
      ['same partial precision', date('2024-05'), [date('2024-05')], true, true],
      ['different precision cannot be decided (plan D3)', date('2024-05-01'), [date('2024-05')], true, false],
    ],
    '!=': [['different precision cannot be decided, so not even != holds', date('2024-05-01'), [date('2024')], true, false]],
    '<': [
      ['years compare at year precision', date('2024'), [date('2023')], true, true],
      ['different precision cannot be decided', date('2024-05-01'), [date('2023')], true, false],
    ],
  }),
  dateTime: ordered(dt('2024-05-01T10:00:00Z'), dt('2024-05-01T09:59:59Z'), dt('2024-05-01T10:00:00Z'), dt('2024-05-01T10:00:00.001Z'), {
    '=': [
      ['the same instant in another offset', dt('2024-05-01T10:00:00Z'), [dt('2024-05-01T12:00:00+02:00')], true, true],
      ['trailing zeros in the fraction do not matter', dt('2024-05-01T10:00:00.5Z'), [dt('2024-05-01T10:00:00.500+00:00')], true, true],
      ['no time on either side compares as a date', dt('2024-05-01'), [dt('2024-05-01')], true, true],
      ['the same instant across a year and a leap day', dt('2024-01-01T00:30:00+01:00'), [dt('2023-12-31T23:30:00Z')], true, true],
      ['a time on one side only cannot be decided', dt('2024-05-01T10:00:00Z'), [dt('2024-05-01')], true, false],
    ],
    '!=': [['a time on one side only cannot be decided', dt('2024-05-01T10:00:00Z'), [dt('2024-05-01')], true, false]],
    '<': [
      ['an earlier instant written later in local time', dt('2024-05-01T10:00:00Z'), [dt('2024-05-01T11:00:00+02:00')], true, true],
      ['across a year boundary and before 1970', dt('1969-12-31T23:00:00-02:00'), [dt('1969-12-31T23:59:59Z')], true, true],
      ['month precision compares as a date', dt('2024-05'), [dt('2024-04')], true, true],
      ['an earlier fraction', dt('2024-05-01T10:00:00.12Z'), [dt('2024-05-01T10:00:00.1Z')], true, true],
      ['early in the year, where the day count starts from March', dt('2024-03-01T00:00:00Z'), [dt('2024-02-29T23:59:59Z')], true, true],
    ],
    '>': [['a later fraction', dt('2024-05-01T10:00:00.1Z'), [dt('2024-05-01T10:00:00.12Z')], true, true]],
  }),
  string: unordered(str('Yes'), str('Yes'), str('No'), {
    '=': [
      ['case is significant', str('Yes'), [str('yes')], true, false],
      ['no trimming', str('Yes'), [str(' Yes')], true, false],
    ],
  }),
  text: unordered(str('twice daily'), str('twice daily'), str('once')),
  choice: unordered(CODE, code({ system: 'urn:smoking', code: 'daily', display: 'Every day' }), code({ system: 'urn:smoking', code: 'never' }), {
    '=': [
      ['display is ignored', CODE, [code({ system: 'urn:smoking', code: 'daily', display: 'Other words' })], true, true],
      ['same code in another system', CODE, [code({ system: 'urn:other', code: 'daily' })], true, false],
      ['a missing system matches only a missing system', code({ code: 'daily' }), [code({ code: 'daily' })], true, true],
      ['a missing system does not match a present one', code({ code: 'daily' }), [CODE], true, false],
      ['a string option value', str('Other'), [str('Other')], true, true],
      ['an integer option value', int(3), [int(3)], true, true],
      ['a date option value', date('2024-05'), [date('2024-05')], true, true],
    ],
  }),
  'open-choice': unordered(CODE, CODE, code({ system: 'urn:smoking', code: 'never' }), {
    '=': [
      ['free text never equals a coding (plan D3)', CODE, [str('daily')], true, false],
      ['answerString compares against free text', str('pipe'), [str('pipe')], true, true],
    ],
    '!=': [['free text is decidably not a coding', CODE, [str('daily')], true, true]],
  }),
  quantity: ordered(qty(70), qty(69.5), qty(70), qty(71), {
    '=': [['another unit cannot be decided, no conversion (plan D3)', qty(70), [qty(70_000, 'g')], true, false]],
    '!=': [['another unit cannot be decided, so not even != holds', qty(70), [qty(70_000, 'g')], true, false]],
    '<': [['another unit cannot be decided', qty(70), [qty(1, 'g')], true, false]],
  }),
};

/** The pairs the load-time table accepts: exists on any answerable type, plus its listed operators. */
function supportedPairs(): [ItemType, Operator][] {
  return ITEM_TYPES.flatMap((type): [ItemType, Operator][] => {
    const { kinds, operators } = COMPARABLE[type];
    return kinds.length === 0 ? [] : [[type, 'exists'], ...operators.map((operator): [ItemType, Operator] => [type, operator])];
  });
}

describe('enableWhen operator × answer type (AC-02.1.3, NFR-Q-05)', () => {
  describe.each(supportedPairs())('%s, operator %s', (type, operator) => {
    const rows = CASES[type]?.[operator] ?? [];
    it.each(rows)(`${operator} on ${type}: %s`, (_, expected, answers, enabled, result) => {
      const state: QuestionState = { enabled, answers };
      expect(holds(operator, expected, state.enabled ? state.answers : [])).toBe(result);
    });
  });

  it('has a named test for every supported pair, and no row for an unsupported one: 0 gaps', () => {
    const supported = supportedPairs().map(([type, operator]) => `${operator} on ${type}`);
    const covered = Object.entries(CASES).flatMap(([type, operators]) =>
      Object.entries(operators ?? {}).filter(([, rows]) => (rows?.length ?? 0) > 0).map(([operator]) => `${operator} on ${type}`),
    );
    expect(supported).toHaveLength(50);
    expect(covered.sort()).toEqual([...supported].sort());
  });

  it('decides a kind that differs from the expected one as unequal, never as an error', () => {
    const kinds: Answer[] = [b(true), int(1), dec(1), date('2024'), dt('2024'), str('a'), CODE, qty(1)];
    for (const answer of kinds) {
      for (const expected of kinds) {
        const numeric = (x: Answer) => x.kind === 'integer' || x.kind === 'decimal';
        if (answer.kind === expected.kind || (numeric(answer) && numeric(expected))) continue;
        expect(compare(answer, expected)).toBe('unequal');
      }
    }
  });
});

describe('own condition (INV-S-02, INV-S-04)', () => {
  const compiled = (items: Parameters<typeof definition>[0], mode: 'strict' | 'lenient' = 'strict'): ItemDef[] => {
    const result = compile(definition(items), mode);
    if (!result.ok) throw new Error(JSON.stringify(result.findings));
    return [...result.definition.items];
  };
  const states = (entries: Record<number, QuestionState>) => (id: number) => entries[id] ?? { enabled: true, answers: [] };

  it('is true with no conditions', () => {
    const [only] = compiled([item('a', 'string')]);
    expect(only && ownCondition(only, states({}))).toBe(true);
  });

  it('is the conjunction under all and the disjunction under any (AC-02.3.1, AC-02.3.2)', () => {
    for (const [behavior, expected] of [['all', false], ['any', true]] as const) {
      const [, , c] = compiled([
        item('a', 'boolean'),
        item('b', 'boolean'),
        item('c', 'string', { enableBehavior: behavior, enableWhen: [when('a', '=', yes), when('b', '=', yes)] }),
      ]);
      expect(c && ownCondition(c, states({ 0: { enabled: true, answers: [yes] }, 1: { enabled: true, answers: [b(false)] } }))).toBe(expected);
    }
  });

  it('reads a disabled question as unanswered, so a retained answer never satisfies it (INV-S-04)', () => {
    const [, gated, negated] = compiled([
      item('a', 'boolean'),
      item('b', 'string', { enableWhen: [when('a', '=', yes)] }),
      item('c', 'string', { enableWhen: [when('a', '!=', yes)] }),
    ]);
    const disabled = states({ 0: { enabled: false, answers: [yes] } });
    expect(gated && ownCondition(gated, disabled)).toBe(false);
    expect(negated && ownCondition(negated, disabled)).toBe(true);
  });

  it('is false for a condition load degraded, and for an item an expression disables (INV-D-04, INV-D-15)', () => {
    const [dangling, gated] = compiled(
      [item('a', 'string', { enableBehavior: 'any', enableWhen: [when('ghost', '=', yes)] }), item('b', 'string', { expressions: [{ kind: 'enableWhen', url: 'urn:x', language: null, expression: null }] })],
      'lenient',
    );
    expect(dangling && ownCondition(dangling, states({}))).toBe(false);
    expect(gated && ownCondition(gated, states({}))).toBe(false);
  });
});
