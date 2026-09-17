import fc from 'fast-check';

import type { Answer } from '../../src/kernel/answer.js';
import type { ConditionInput, DefinitionInput, ItemInput } from '../../src/kernel/input.js';
import type { Operator } from '../../src/kernel/item-type.js';
import type { ModelCommand, Oracle } from '../oracle.js';

/**
 * Generated questionnaires and command sequences (ADR-0009 verification).
 *
 * Every questionnaire compiles in strict mode by construction, so no run is
 * thrown away: items are numbered, a parent is always an earlier group, and a
 * condition only reads an earlier question whose repeating groups all enclose
 * the dependent (INV-D-13). Every edge then runs from a lower number to a
 * higher one, which rules out cycles. Nesting reaches three levels and
 * repeats nest, because scope resolution inside nested repeats is where the
 * engine is most likely to be wrong.
 */

export type Kind = 'boolean' | 'integer' | 'string' | 'group' | 'repeat';

interface RawItem {
  readonly kind: Kind;
  readonly parent: number;
  readonly conditions: readonly { readonly question: number; readonly operator: number; readonly value: number }[];
  readonly any: boolean;
  readonly maxOccurs: number | null;
}

interface Built {
  readonly kind: Kind;
  readonly parent: number;
  readonly depth: number;
  readonly children: number[];
  conditions: ConditionInput[];
  readonly any: boolean;
  readonly maxOccurs: number | null;
}

type Answerable = 'boolean' | 'integer' | 'string';

const OPERATORS: Readonly<Record<Answerable, readonly Operator[]>> = {
  boolean: ['=', '!=', 'exists'],
  integer: ['=', '!=', '>', '<', '>=', '<=', 'exists'],
  string: ['=', '!=', 'exists'],
};

const rawItem: fc.Arbitrary<RawItem> = fc.record({
  kind: fc.constantFrom<Kind>('boolean', 'boolean', 'integer', 'string', 'group', 'repeat', 'repeat'),
  parent: fc.nat(),
  conditions: fc.array(fc.record({ question: fc.nat(), operator: fc.nat(), value: fc.nat() }), { maxLength: 2 }),
  any: fc.boolean(),
  maxOccurs: fc.option(fc.integer({ min: 1, max: 3 }), { nil: null }),
});

export const linkIdOf = (index: number): string => `q${index}`;

export function valueFor(kind: Kind, value: number): Answer {
  if (kind === 'integer') return { kind: 'integer', value: value % 4 };
  if (kind === 'string') return { kind: 'string', value: value % 2 === 0 ? 'a' : 'b' };
  return { kind: 'boolean', value: value % 2 === 0 };
}

const answerable = (kind: Kind): kind is Answerable => kind === 'boolean' || kind === 'integer' || kind === 'string';

export interface Generated {
  readonly input: DefinitionInput;
  /** Item kinds by number; item `n` has linkId `q<n>`. */
  readonly kinds: readonly Kind[];
}

function build(raws: readonly RawItem[]): Generated {
  const built: Built[] = [];
  const above = (index: number): number[] => {
    const out: number[] = [];
    for (let at = built[index]?.parent ?? -1; at !== -1; at = built[at]?.parent ?? -1) out.push(at);
    return out;
  };

  for (const [index, raw] of raws.entries()) {
    const parents = [-1, ...built.flatMap((item, at) => ((item.kind === 'group' || item.kind === 'repeat') && item.depth < 3 ? [at] : []))];
    const parent = parents[raw.parent % parents.length] ?? -1;
    const depth = parent === -1 ? 0 : (built[parent]?.depth ?? 0) + 1;
    const current: Built = { kind: raw.kind, parent, depth, children: [], conditions: [], any: raw.any, maxOccurs: raw.maxOccurs };
    built.push(current);
    if (parent !== -1) built[parent]?.children.push(index);

    const enclosing = new Set(above(index));
    const questions = built.flatMap((item, at) =>
      at < index && answerable(item.kind) && above(at).every((scope) => built[scope]?.kind !== 'repeat' || enclosing.has(scope)) ? [at] : [],
    );
    if (questions.length === 0) continue;
    current.conditions = raw.conditions.map((condition) => {
      const question = questions[condition.question % questions.length] as number;
      const kind = built[question]?.kind as Answerable;
      const operator = OPERATORS[kind][condition.operator % OPERATORS[kind].length] as Operator;
      const answer = operator === 'exists' ? valueFor('boolean', condition.value) : valueFor(kind, condition.value);
      return { question: linkIdOf(question), operator, answer, answerType: answer.kind };
    });
  }

  const toItem = (index: number): ItemInput => {
    const item = built[index] as Built;
    const group = item.kind === 'group' || item.kind === 'repeat';
    return {
      linkId: linkIdOf(index),
      type: group ? 'group' : (item.kind as Answerable),
      authoredType: group ? 'group' : item.kind,
      text: '',
      required: false,
      repeats: item.kind === 'repeat',
      children: item.children.map(toItem),
      enableWhen: item.conditions,
      enableBehavior: item.conditions.length > 1 ? (item.any ? 'any' : 'all') : null,
      options: [],
      valueSet: null,
      maxLength: null,
      minOccurs: null,
      maxOccurs: item.kind === 'repeat' ? item.maxOccurs : null,
      itemControl: null,
      renderingXhtml: null,
      expressions: [],
      hasInitial: false,
    };
  };
  const roots = built.flatMap((item, index) => (item.parent === -1 ? [index] : []));
  return { input: { url: null, version: null, items: roots.map(toItem), expressions: [] }, kinds: built.map((item) => item.kind) };
}

export const questionnaires: fc.Arbitrary<Generated> = fc.array(rawItem, { minLength: 2, maxLength: 24, size: 'medium' }).map(build);

/** An abstract command: which item, which of its nodes, which value. It becomes concrete against the oracle's current tree. */
export interface AbstractCommand {
  readonly op: 'set' | 'clear' | 'add' | 'remove';
  readonly item: number;
  readonly node: number;
  readonly value: number;
  readonly ordinal: number;
}

export const commandSequences: fc.Arbitrary<AbstractCommand[]> = fc.array(
  fc.record({
    op: fc.constantFrom<AbstractCommand['op']>('set', 'set', 'set', 'clear', 'add', 'add', 'remove'),
    item: fc.nat(),
    node: fc.nat(),
    value: fc.nat(),
    ordinal: fc.nat(),
  }),
  { minLength: 5, maxLength: 40, size: 'medium' },
);

/**
 * The concrete command for this moment, or `null` when there is no node of
 * the right sort. Disabled nodes are chosen as freely as enabled ones, so
 * refusals are exercised as well.
 */
export function concretise(abstract: AbstractCommand, kinds: readonly Kind[], oracle: Oracle): ModelCommand | null {
  const repeat = abstract.op === 'add' || abstract.op === 'remove';
  const items = kinds.flatMap((kind, index) => ((repeat ? kind === 'repeat' : answerable(kind)) ? [index] : []));
  if (items.length === 0) return null;
  const item = items[abstract.item % items.length] as number;
  const { order, nodes } = oracle.tree();
  const candidates = order.filter((path) => nodes.get(path)?.item.linkId === linkIdOf(item));
  const path = candidates[abstract.node % Math.max(candidates.length, 1)];
  if (path === undefined) return null;
  switch (abstract.op) {
    case 'set':
      return { type: 'SetAnswer', path, answers: [valueFor(kinds[item] as Kind, abstract.value)] };
    case 'clear':
      return { type: 'ClearAnswer', path };
    case 'add':
      return { type: 'AddRepeatInstance', path };
    case 'remove': {
      const ordinals = oracle.instances.get(path)?.ordinals ?? [0];
      // One pick in (n + 1) names an ordinal that is not live.
      return { type: 'RemoveRepeatInstance', path, ordinal: ordinals[abstract.ordinal % (ordinals.length + 1)] ?? 99 };
    }
  }
}

/** The same questionnaire with every sibling list permuted, deterministically from `seed` (INV-S-06). */
export function shuffled(input: DefinitionInput, seed: number): DefinitionInput {
  let state = (seed % 2_147_483_646) + 1;
  const next = (): number => (state = (state * 48_271) % 2_147_483_647);
  const permute = <T>(list: readonly T[]): T[] => {
    const out = [...list];
    for (let at = out.length - 1; at > 0; at -= 1) {
      const swap = next() % (at + 1);
      [out[at], out[swap]] = [out[swap] as T, out[at] as T];
    }
    return out;
  };
  const visit = (item: ItemInput): ItemInput => ({ ...item, children: permute(item.children.map(visit)) });
  return { ...input, items: permute(input.items.map(visit)) };
}
