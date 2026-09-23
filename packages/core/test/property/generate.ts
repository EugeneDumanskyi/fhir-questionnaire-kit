import fc from 'fast-check';

import type { Command, CommandResult, Questionnaire, Session } from '../../src/index.js';
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

export type Kind = 'boolean' | 'integer' | 'string' | 'group' | 'repeat' | ValueKind;

/**
 * The other answer kinds, for M3's round trip (INV-E-06): they carry answers
 * but no condition reads them, so the M2 properties keep their shape. `strings`
 * is a repeating `string` question, which holds two answers.
 */
export type ValueKind = 'decimal' | 'date' | 'dateTime' | 'choice' | 'quantity' | 'strings';

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

const rawItem = (...kinds: readonly Kind[]): fc.Arbitrary<RawItem> => fc.record({
  kind: fc.constantFrom<Kind>(...kinds),
  parent: fc.nat(),
  conditions: fc.array(fc.record({ question: fc.nat(), operator: fc.nat(), value: fc.nat() }), { maxLength: 2 }),
  any: fc.boolean(),
  maxOccurs: fc.option(fc.integer({ min: 1, max: 3 }), { nil: null }),
});

export const linkIdOf = (index: number): string => `q${index}`;

const pick = <T>(list: readonly T[], value: number): T => list[value % list.length] as T;

/** The dates and date-times cover every precision, offsets east and west, and a fraction (repository date rules). */
const VALUES: Readonly<Record<ValueKind, (value: number) => Answer>> = {
  decimal: (value) => ({ kind: 'decimal', value: pick([0.5, 1.25, -3, 1e-7, 70], value) }),
  date: (value) => ({ kind: 'date', value: pick(['2024', '2024-05', '2024-05-06', '1999-12-31'], value) }),
  dateTime: (value) => ({
    kind: 'dateTime',
    value: pick(['2024-05-06T10:00:00+05:30', '2024-05-06T10:00:00Z', '2024-05', '2024-05-06T23:59:59.5-08:00', '2024'], value),
  }),
  choice: (value) => ({ kind: 'coding', value: pick(CODINGS, value) }),
  quantity: (value) => ({ kind: 'quantity', value: { value: (value % 3) + 0.5, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' } }),
  strings: (value) => ({ kind: 'string', value: pick(['x', 'y', 'z'], value) }),
};

const CODINGS = [
  { system: 'urn:fhirq:test', code: 'a', display: 'A' },
  { system: 'urn:fhirq:test', code: 'b' },
];

export function valueFor(kind: Kind, value: number): Answer {
  if (kind === 'integer') return { kind: 'integer', value: value % 4 };
  if (kind === 'string') return { kind: 'string', value: value % 2 === 0 ? 'a' : 'b' };
  if (kind === 'boolean' || kind === 'group' || kind === 'repeat') return { kind: 'boolean', value: value % 2 === 0 };
  return VALUES[kind](value);
}

/** The answers a `set` command gives: two for a repeating question. */
export function answersFor(kind: Kind, value: number): Answer[] {
  return kind === 'strings' ? [valueFor(kind, value), valueFor(kind, value + 1)] : [valueFor(kind, value)];
}

/** Kinds a condition may read. */
const answerable = (kind: Kind): kind is Answerable => kind === 'boolean' || kind === 'integer' || kind === 'string';

/** Kinds that hold answers. */
export const holdsAnswers = (kind: Kind): boolean => kind !== 'group' && kind !== 'repeat';

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
    const type = group ? 'group' : item.kind === 'strings' ? 'string' : item.kind;
    return {
      linkId: linkIdOf(index),
      type,
      authoredType: type,
      text: '',
      required: false,
      repeats: item.kind === 'repeat' || item.kind === 'strings',
      children: item.children.map(toItem),
      enableWhen: item.conditions,
      enableBehavior: item.conditions.length > 1 ? (item.any ? 'any' : 'all') : null,
      options: item.kind === 'choice' ? CODINGS.map((value) => ({ value: { kind: 'coding', value }, valueType: 'Coding' })) : [],
      valueSet: null,
      maxLength: null,
      minValue: null,
      maxValue: null,
      maxDecimalPlaces: null,
      minOccurs: null,
      maxOccurs: item.kind === 'repeat' ? item.maxOccurs : null,
      units: [],
      itemControl: null,
      renderingXhtml: null,
      expressions: [],
      hasInitial: false,
    };
  };
  const roots = built.flatMap((item, index) => (item.parent === -1 ? [index] : []));
  return { input: { url: null, version: null, items: roots.map(toItem), expressions: [] }, kinds: built.map((item) => item.kind) };
}

export const questionnaires: fc.Arbitrary<Generated> = fc
  .array(rawItem('boolean', 'boolean', 'integer', 'string', 'group', 'repeat', 'repeat'), { minLength: 2, maxLength: 24, size: 'medium' })
  .map(build);

/** Every answer kind, for emission and hydration (M3): conditions still read only boolean, integer and string questions. */
export const richQuestionnaires: fc.Arbitrary<Generated> = fc
  .array(
    rawItem('boolean', 'boolean', 'integer', 'string', 'group', 'repeat', 'repeat', 'decimal', 'date', 'dateTime', 'choice', 'quantity', 'strings'),
    { minLength: 2, maxLength: 24, size: 'medium' },
  )
  .map(build);

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
  const items = kinds.flatMap((kind, index) => ((repeat ? kind === 'repeat' : holdsAnswers(kind)) ? [index] : []));
  if (items.length === 0) return null;
  const item = items[abstract.item % items.length] as number;
  const { order, nodes } = oracle.tree();
  const candidates = order.filter((path) => nodes.get(path)?.item.linkId === linkIdOf(item));
  const path = candidates[abstract.node % Math.max(candidates.length, 1)];
  if (path === undefined) return null;
  switch (abstract.op) {
    case 'set':
      return { type: 'SetAnswer', path, answers: answersFor(kinds[item] as Kind, abstract.value) };
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

/**
 * A generated questionnaire as the R4 JSON a host would load, so M3's
 * properties go through the public entry points and the codec both ways.
 */
export function toR4(input: DefinitionInput, url: string | null = 'urn:fhirq:generated'): Questionnaire {
  const answerKey: Readonly<Record<Answer['kind'], string>> = {
    boolean: 'answerBoolean',
    integer: 'answerInteger',
    decimal: 'answerDecimal',
    date: 'answerDate',
    dateTime: 'answerDateTime',
    string: 'answerString',
    coding: 'answerCoding',
    quantity: 'answerQuantity',
  };
  const item = (input: ItemInput): Record<string, unknown> => ({
    linkId: input.linkId,
    type: input.type,
    ...(input.repeats ? { repeats: true } : {}),
    ...(input.maxOccurs === null ? {} : { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-maxOccurs', valueInteger: input.maxOccurs }] }),
    ...(input.enableWhen.length === 0
      ? {}
      : {
          enableWhen: input.enableWhen.map((condition) => ({
            question: condition.question,
            operator: condition.operator,
            ...(condition.answer === null ? {} : { [answerKey[condition.answer.kind]]: condition.answer.value }),
          })),
        }),
    ...(input.enableBehavior === null ? {} : { enableBehavior: input.enableBehavior }),
    ...(input.options.length === 0 ? {} : { answerOption: input.options.map((option) => ({ valueCoding: option.value?.value })) }),
    // R4 rule que-1: a group has items. An empty generated group gets a display item, which holds no answer.
    ...(input.children.length > 0
      ? { item: input.children.map(item) }
      : input.type === 'group'
        ? { item: [{ linkId: `${input.linkId}-note`, type: 'display' }] }
        : {}),
  });
  return { resourceType: 'Questionnaire', status: 'active', ...(url === null ? {} : { url, version: '1' }), item: input.items.map(item) };
}

/**
 * Plays an abstract sequence against a session through its public API,
 * choosing among the nodes it shows: enough for M3's properties, which need
 * retained answers (answer, then hide) but not refusals. Every fifth command
 * also leaves the node it targeted, so surfacing is exercised. `answers`
 * rewrites what a `set` gives, for the leak test's sentinels.
 */
export function drive(
  session: Session,
  kinds: readonly Kind[],
  sequence: readonly AbstractCommand[],
  answers: (answers: Answer[]) => Answer[] = (given) => given,
): CommandResult[] {
  const results: CommandResult[] = [];
  for (const abstract of sequence) {
    const repeat = abstract.op === 'add' || abstract.op === 'remove';
    const items = kinds.flatMap((kind, index) => ((repeat ? kind === 'repeat' : holdsAnswers(kind)) ? [index] : []));
    if (items.length === 0) continue;
    const item = items[abstract.item % items.length] as number;
    const nodes = session.getSnapshot().nodes.filter((node) => node.item.linkId === linkIdOf(item));
    const node = nodes[abstract.node % Math.max(nodes.length, 1)];
    if (node === undefined) continue;
    const { path } = node;
    const command: Command =
      abstract.op === 'set'
        ? { type: 'SetAnswer', path, answers: answers(answersFor(kinds[item] as Kind, abstract.value)) }
        : abstract.op === 'clear'
          ? { type: 'ClearAnswer', path }
          : abstract.op === 'add'
            ? { type: 'AddRepeatInstance', path }
            : { type: 'RemoveRepeatInstance', path, ordinal: node.instances[abstract.ordinal % Math.max(node.instances.length, 1)] ?? 99 };
    results.push(session.dispatch(command));
    if (abstract.value % 5 === 0) results.push(session.dispatch({ type: 'NoteItemLeft', path }));
  }
  return results;
}
