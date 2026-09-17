import { describe, expect, it } from 'vitest';

import { compile, type CompileResult, type Definition, type LoadMode } from '../../src/definition/compile.js';
import { CHAIN_CEILING, NESTING_CEILING } from '../../src/definition/graph.js';
import { parseQuestionnaire } from '../../src/fhir/r4/parse.js';
import type { DefinitionInput, ItemInput } from '../../src/kernel/input.js';
import { definition, expression, group, item, repeating, when, yes } from './input.js';

const MODES: readonly LoadMode[] = ['strict', 'lenient'];

function ok(input: DefinitionInput, mode: LoadMode = 'strict'): Definition {
  const result = compile(input, mode);
  if (!result.ok) throw new Error(JSON.stringify(result.findings));
  return result.definition;
}

function codes(result: CompileResult): string[] {
  return result.ok ? result.definition.diagnostics.map((d) => d.code) : result.findings.map((d) => d.code);
}

const byLinkId = (def: Definition, linkId: string) => def.items[def.byLinkId.get(linkId) ?? -1];

describe('flat tables in document order (ADR-0009 load step 1)', () => {
  const input = definition([
    item('intro', 'display'),
    repeating('meds', [item('name', 'string'), repeating('doses', [item('amount', 'quantity')], { maxOccurs: 4 })], { minOccurs: 1 }),
    group('about/you', [item('age', 'integer', { required: true })]),
  ]);

  it('gives dense ids in pre-order, with parents, children, roots and paths', () => {
    const def = ok(input);
    expect(def.items.map((i) => [i.id, i.linkId, i.parent, i.children, i.path])).toEqual([
      [0, 'intro', -1, [], 'intro'],
      [1, 'meds', -1, [2, 3], 'meds'],
      [2, 'name', 1, [], 'meds/name'],
      [3, 'doses', 1, [4], 'meds/doses'],
      [4, 'amount', 3, [], 'meds/doses/amount'],
      [5, 'about/you', -1, [6], 'about%2Fyou'],
      [6, 'age', 5, [], 'about%2Fyou/age'],
    ]);
    expect(def.roots).toEqual([0, 1, 5]);
    expect(def.byLinkId.get('age')).toBe(6);
  });

  it('records the nearest repeating group and cardinality', () => {
    const def = ok(input);
    expect(def.items.map((i) => i.repeatScope)).toEqual([-1, -1, 1, 1, 3, -1, -1]);
    expect(byLinkId(def, 'meds')).toMatchObject({ minOccurs: 1, maxOccurs: null, repeats: true });
    expect(byLinkId(def, 'doses')).toMatchObject({ minOccurs: 0, maxOccurs: 4 });
    expect(byLinkId(def, 'age')).toMatchObject({ required: true, behavior: 'all', calculated: false, forcedDisabled: false });
  });

  it('carries the canonical, the load mode and what presentation will need', () => {
    const def = ok(
      definition([item('pick', 'choice', { options: [{ value: { kind: 'string', value: 'a' }, valueType: 'String' }], valueSet: null, itemControl: 'drop-down', renderingXhtml: '<b>x</b>', maxLength: null })], {
        url: 'urn:q',
        version: '3',
      }),
      'lenient',
    );
    expect(def).toMatchObject({ url: 'urn:q', version: '3', loadMode: 'lenient', diagnostics: [] });
    expect(def.items[0]).toMatchObject({ options: [{ kind: 'string', value: 'a' }], itemControl: 'drop-down', renderingXhtml: '<b>x</b>' });
  });

  it('compiles what the R4 parser produces', () => {
    const parsed = parseQuestionnaire({
      resourceType: 'Questionnaire',
      item: [
        { linkId: 'smoker', type: 'boolean' },
        { linkId: 'amount', type: 'integer', enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const def = ok(parsed.input);
    expect(byLinkId(def, 'amount')?.conditions).toEqual([{ kind: 'test', question: 0, operator: '=', answer: yes }]);
  });
});

describe('dependency edges, scopes and ranks (ADR-0009 load steps 2–3, INV-D-13)', () => {
  it('labels an edge global outside repeats and same-instance inside one, once per pair', () => {
    const def = ok(
      definition([
        item('consent', 'boolean'),
        repeating('meds', [
          item('taking', 'boolean', { enableWhen: [when('consent', '=', yes)] }),
          item('dose', 'string', { enableBehavior: 'all', enableWhen: [when('taking', '=', yes), when('taking', 'exists', yes)] }),
        ]),
      ]),
    );
    expect(byLinkId(def, 'consent')?.dependents).toEqual([{ dependent: 2, scope: -1 }]);
    expect(byLinkId(def, 'taking')?.dependents).toEqual([{ dependent: 3, scope: 1 }]);
    expect(byLinkId(def, 'dose')?.dependents).toEqual([]);
  });

  it('lets a condition in a nested repeat read its enclosing instance', () => {
    const def = ok(definition([repeating('visit', [item('ill', 'boolean'), repeating('symptom', [item('what', 'string', { enableWhen: [when('ill', '=', yes)] })])])]));
    expect(byLinkId(def, 'ill')?.dependents).toEqual([{ dependent: 3, scope: 0 }]);
  });

  it('ranks strictly increase along every tree and dependency edge, whatever the declaration order', () => {
    const items: ItemInput[] = [
      item('c', 'boolean', { enableWhen: [when('b', '=', yes)] }),
      group('g', [item('d', 'boolean', { enableWhen: [when('c', '=', yes)] })], { enableWhen: [when('a', '=', yes)] }),
      item('b', 'boolean', { enableWhen: [when('a', '=', yes)] }),
      item('a', 'boolean'),
    ];
    for (const order of [items, [...items].reverse()]) {
      const def = ok(definition(order));
      for (const it of def.items) {
        for (const child of it.children) expect(def.items[child]?.rank).toBeGreaterThan(it.rank);
        for (const edge of it.dependents) expect(def.items[edge.dependent]?.rank).toBeGreaterThan(it.rank);
      }
      expect(byLinkId(def, 'a')?.rank).toBe(0);
      expect(byLinkId(def, 'd')?.rank).toBe(3);
    }
  });
});

describe('INV-D-02 and INV-D-05: rejected in both modes', () => {
  it.each(MODES)('rejects duplicate linkIds, naming the path of each repeat (%s)', (mode) => {
    const result = compile(definition([item('a', 'string'), group('g', [item('a', 'string')]), item('a', 'boolean')]), mode);
    expect(result).toEqual({
      ok: false,
      findings: [
        { code: 'duplicate-link-id', severity: 'error', path: 'g/a', related: ['a'], detail: null },
        { code: 'duplicate-link-id', severity: 'error', path: 'a', related: ['a'], detail: null },
      ],
    });
  });

  it.each(MODES)('rejects a cycle naming every linkId in it, and attempts nothing else (%s)', (mode) => {
    const result = compile(
      definition([
        item('a', 'boolean', { enableWhen: [when('c', '=', yes)] }),
        item('b', 'boolean', { enableWhen: [when('a', '=', yes)] }),
        item('c', 'boolean', { enableWhen: [when('b', '=', yes)] }),
        item('self', 'boolean', { enableWhen: [when('self', '=', yes)] }),
      ]),
      mode,
    );
    expect(result).toEqual({
      ok: false,
      findings: [
        { code: 'dependency-cycle', severity: 'error', path: 'a', related: ['a', 'b', 'c'], detail: null },
        { code: 'dependency-cycle', severity: 'error', path: 'self', related: ['self'], detail: null },
      ],
    });
  });

  it('rejects a group gated on its own descendant, which could never be enabled', () => {
    const result = compile(definition([group('g', [item('inside', 'boolean')], { enableWhen: [when('inside', '=', yes)] })]), 'lenient');
    expect(result).toMatchObject({ ok: false, findings: [{ code: 'dependency-cycle', related: ['g', 'inside'] }] });
  });
});

describe('INV-D-07: depth ceilings, rejected in both modes (NFR-P-05)', () => {
  const nested = (levels: number): ItemInput => {
    let inner: ItemInput = item('leaf', 'string');
    for (let level = levels; level >= 1; level -= 1) inner = group(`g${level}`, [inner]);
    return inner;
  };
  const chain = (edges: number): ItemInput[] =>
    Array.from({ length: edges + 1 }, (_, i) => item(`q${i}`, 'boolean', i === 0 ? {} : { enableWhen: [when(`q${i - 1}`, '=', yes)] }));

  it('accepts group nesting at the ceiling and rejects one level more', () => {
    expect(compile(definition([nested(NESTING_CEILING)]), 'strict').ok).toBe(true);
    expect(compile(definition([nested(NESTING_CEILING + 1)]), 'lenient')).toEqual({
      ok: false,
      findings: [expect.objectContaining({ code: 'nesting-too-deep', path: 'g1/g2/g3/g4/g5/g6/g7/g8/g9/g10/g11' })],
    });
  });

  it('accepts an enableWhen chain at the ceiling and rejects one link more', () => {
    expect(compile(definition(chain(CHAIN_CEILING)), 'strict').ok).toBe(true);
    expect(compile(definition(chain(CHAIN_CEILING + 1)), 'lenient')).toEqual({
      ok: false,
      findings: [expect.objectContaining({ code: 'chain-too-deep', path: 'q11' })],
    });
  });
});

describe('the strict/lenient matrix (04-domain.md §5.1)', () => {
  it('INV-D-03: strict lists every unsupported linkId with its type; lenient keeps placeholders', () => {
    const input = definition([item('file', null, { authoredType: 'attachment' }), item('ok', 'string'), item('when', null, { authoredType: 'time' })]);
    expect(compile(input, 'strict')).toEqual({
      ok: false,
      findings: [
        { code: 'unsupported-item-type', severity: 'error', path: 'file', related: [], detail: 'attachment' },
        { code: 'unsupported-item-type', severity: 'error', path: 'when', related: [], detail: 'time' },
      ],
    });
    const def = ok(input, 'lenient');
    expect(def.items.map((i) => i.type)).toEqual([null, 'string', null]);
    expect(codes({ ok: true, definition: def })).toEqual(['unsupported-item-type', 'unsupported-item-type']);
  });

  it('INV-D-04: a dangling condition rejects in strict and is false in lenient', () => {
    const input = definition([item('b', 'string', { enableWhen: [when('ghost', '=', yes)] })]);
    expect(compile(input, 'strict')).toEqual({
      ok: false,
      findings: [{ code: 'dangling-condition', severity: 'error', path: 'b', related: ['ghost'], detail: null }],
    });
    expect(ok(input, 'lenient').items[0]?.conditions).toEqual([{ kind: 'never' }]);
  });

  it.each([
    ['> on a string (AC-02.5.3)', item('q', 'string'), when('q', '>', { kind: 'string', value: 'x' })],
    ['an integer answer on a boolean', item('q', 'boolean'), when('q', '=', { kind: 'integer', value: 1 })],
    ['a date answer on a dateTime', item('q', 'dateTime'), when('q', '=', { kind: 'date', value: '2024' })],
    ['ordering on a choice', item('q', 'choice'), when('q', '<', { kind: 'integer', value: 1 })],
    ['exists with a non-boolean answer', item('q', 'string'), when('q', 'exists', { kind: 'string', value: 'x' })],
    ['exists on a display', item('q', 'display'), when('q', 'exists', yes)],
    ['any condition on a group', group('q', [item('x', 'string')]), when('q', '=', yes)],
    ['a time answer', item('q', 'string'), when('q', '=', null)],
  ])('INV-D-06: %s is a warning in both modes and evaluates false', (_, question, condition) => {
    for (const mode of MODES) {
      const def = ok(definition([question, item('b', 'string', { enableWhen: [condition] })]), mode);
      expect(byLinkId(def, 'b')?.conditions).toEqual([{ kind: 'never' }]);
      expect(def.diagnostics).toEqual([
        { code: 'meaningless-condition', severity: 'warning', path: 'b', related: ['q'], detail: condition.operator },
      ]);
    }
  });

  it.each([
    ['decimal against an integer answer', item('q', 'decimal'), when('q', '>=', { kind: 'integer', value: 2 })],
    ['integer against a decimal answer', item('q', 'integer'), when('q', '<', { kind: 'decimal', value: 2.5 })],
    ['a coding on an open-choice', item('q', 'open-choice'), when('q', '!=', { kind: 'coding', value: { code: 'x' } })],
    ['free text on an open-choice', item('q', 'open-choice'), when('q', '=', { kind: 'string', value: 'x' })],
    ['ordering on a quantity', item('q', 'quantity'), when('q', '>', { kind: 'quantity', value: { value: 1 } })],
    ['ordering on a date', item('q', 'date'), when('q', '<=', { kind: 'date', value: '2024-05' })],
    ['exists on a text', item('q', 'text'), when('q', 'exists', yes)],
  ])('INV-D-06: %s is meaningful', (_, question, condition) => {
    const def = ok(definition([question, item('b', 'string', { enableWhen: [condition] })]));
    expect(byLinkId(def, 'b')?.conditions[0]?.kind).toBe('test');
  });

  it('INV-D-06: a condition on a lenient placeholder is meaningless', () => {
    const def = ok(definition([item('file', null), item('b', 'string', { enableWhen: [when('file', 'exists', yes)] })]), 'lenient');
    expect(codes({ ok: true, definition: def })).toEqual(['unsupported-item-type', 'meaningless-condition']);
  });

  it.each([
    ['from outside the group', definition([repeating('meds', [item('taking', 'boolean')]), item('b', 'string', { enableWhen: [when('taking', '=', yes)] })])],
    ['from the repeating group itself', definition([repeating('meds', [item('taking', 'boolean')], { enableWhen: [when('taking', '=', yes)] })])],
    [
      'from an outer instance into a nested repeat',
      definition([repeating('visit', [repeating('symptom', [item('severe', 'boolean')]), item('b', 'string', { enableWhen: [when('severe', '=', yes)] })])]),
    ],
  ])('INV-D-13: a condition reaching into a repeat %s rejects in strict and is false in lenient', (_, input) => {
    const strict = compile(input, 'strict');
    expect(strict.ok).toBe(false);
    expect(codes(strict)).toEqual(['condition-crosses-repeat']);
    const lenient = ok(input, 'lenient');
    expect(lenient.items.flatMap((i) => i.conditions)).toEqual([{ kind: 'never' }]);
    expect(lenient.diagnostics[0]).toMatchObject({ severity: 'error', related: [expect.any(String)] });
  });

  it('INV-D-14 and INV-D-09: a condition on a calculated item rejects in strict; the binding warns in both modes', () => {
    const input = definition([item('bmi', 'decimal', { expressions: [expression('calculated')] }), item('b', 'string', { enableWhen: [when('bmi', '>', { kind: 'decimal', value: 30 })] })]);
    expect(compile(input, 'strict')).toEqual({
      ok: false,
      findings: [{ code: 'condition-on-calculated', severity: 'error', path: 'b', related: ['bmi'], detail: null }],
    });
    const def = ok(input, 'lenient');
    expect(byLinkId(def, 'bmi')?.calculated).toBe(true);
    expect(byLinkId(def, 'b')?.conditions).toEqual([{ kind: 'never' }]);
    expect(def.diagnostics.map((d) => [d.code, d.severity, d.detail])).toEqual([
      ['no-evaluator', 'warning', 'urn:extension:calculated'],
      ['condition-on-calculated', 'error', null],
    ]);
  });

  it.each(['enableWhen', 'answer', 'candidate', 'initial'] as const)('INV-D-15: %sExpression rejects in strict, naming the extension', (kind) => {
    expect(compile(definition([item('q', 'string', { expressions: [expression(kind)] })]), 'strict')).toEqual({
      ok: false,
      findings: [{ code: 'unsupported-extension', severity: 'error', path: 'q', related: [], detail: `urn:extension:${kind}` }],
    });
  });

  it('INV-D-15: in lenient mode enableWhenExpression disables the item; the others are diagnostics', () => {
    const def = ok(
      definition([
        item('gated', 'string', { expressions: [expression('enableWhen')] }),
        item('listed', 'choice', { expressions: [expression('answer'), expression('candidate'), expression('initial')] }),
      ]),
      'lenient',
    );
    expect(def.items.map((i) => i.forcedDisabled)).toEqual([true, false]);
    expect(def.diagnostics.map((d) => [d.path, d.code])).toEqual([
      ['gated', 'unsupported-extension'], ['listed', 'unsupported-extension'], ['listed', 'unsupported-extension'], ['listed', 'unsupported-extension'],
    ]);
  });

  it.each(MODES)('INV-D-15: context extensions are only warnings, on items and the questionnaire (%s)', (mode) => {
    const def = ok(definition([item('q', 'string', { expressions: [expression('variable')] })], { expressions: [expression('launchContext')] }), mode);
    expect(def.diagnostics.map((d) => [d.path, d.code, d.severity])).toEqual([
      [null, 'context-extension-ignored', 'warning'],
      ['q', 'context-extension-ignored', 'warning'],
    ]);
  });

  it('INV-D-15: an unsupported expression on the questionnaire itself rejects in strict', () => {
    expect(codes(compile(definition([], { expressions: [expression('initial')] }), 'strict'))).toEqual(['unsupported-extension']);
  });

  it('INV-D-16: several conditions with no enableBehavior reject in strict and apply all in lenient (AC-02.3.3)', () => {
    const input = definition([item('a', 'boolean'), item('b', 'boolean'), item('c', 'string', { enableWhen: [when('a', '=', yes), when('b', '=', yes)] })]);
    expect(compile(input, 'strict')).toEqual({
      ok: false,
      findings: [{ code: 'missing-enable-behavior', severity: 'error', path: 'c', related: [], detail: null }],
    });
    expect(byLinkId(ok(input, 'lenient'), 'c')?.behavior).toBe('all');
    expect(compile(definition([item('a', 'boolean'), item('c', 'string', { enableWhen: [when('a', '=', yes)] })]), 'strict').ok).toBe(true);
  });

  it('INV-D-17: items under a question reject in strict; in lenient every descendant is a placeholder', () => {
    const input = definition([item('q', 'string', { children: [repeating('g', [item('inner', 'boolean')])] }), item('after', 'string')]);
    expect(codes(compile(input, 'strict'))).toEqual(['items-under-question']);
    const def = ok(input, 'lenient');
    expect(def.items.map((i) => [i.linkId, i.type, i.repeats, i.repeatScope])).toEqual([
      ['q', 'string', false, -1],
      ['g', null, false, -1],
      ['inner', null, false, -1],
      ['after', 'string', false, -1],
    ]);
    expect(def.diagnostics).toEqual([{ code: 'items-under-question', severity: 'error', path: 'q', related: [], detail: null }]);
  });

  it.each(MODES)('INV-D-18: initial values are ignored with a warning (%s)', (mode) => {
    expect(ok(definition([item('q', 'string', { hasInitial: true })]), mode).diagnostics).toEqual([
      { code: 'initial-value-ignored', severity: 'warning', path: 'q', related: [], detail: null },
    ]);
  });

  it('INV-D-19: an unsupported option value rejects in strict; in lenient the item is a placeholder', () => {
    const input = definition([
      item('pick', 'choice', { options: [{ value: { kind: 'string', value: 'a' }, valueType: 'String' }, { value: null, valueType: 'Reference' }] }),
    ]);
    expect(compile(input, 'strict')).toEqual({
      ok: false,
      findings: [{ code: 'unsupported-option-type', severity: 'error', path: 'pick', related: [], detail: 'Reference' }],
    });
    expect(ok(input, 'lenient').items[0]).toMatchObject({ type: null, options: [{ kind: 'string', value: 'a' }] });
  });

  it('strict mode lists every rejecting finding at once, and leaves warnings out of the error', () => {
    const result = compile(
      definition([
        item('file', null),
        item('q', 'string', { hasInitial: true, enableWhen: [when('ghost', '=', yes)] }),
        item('x', 'boolean', { enableWhen: [when('y', '=', yes)] }),
        item('y', 'boolean', { enableWhen: [when('x', '=', yes)] }),
      ]),
      'strict',
    );
    expect(codes(result)).toEqual(['unsupported-item-type', 'dangling-condition', 'dependency-cycle']);
  });

  it('never puts an authored answer into a finding (INV-D-10)', () => {
    const result = compile(definition([item('b', 'string', { enableWhen: [when('ghost', '=', { kind: 'string', value: 'secret-value' })] })]), 'lenient');
    expect(JSON.stringify(result.ok ? result.definition.diagnostics : result.findings)).not.toContain('secret');
  });
});
