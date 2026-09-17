/**
 * An item definition's identity (`04-domain.md` §1). Unique across the whole
 * item tree (INV-D-02). A plain alias: it documents intent in signatures, and
 * a brand would buy nothing the uniqueness check does not already give.
 *
 * @beta
 */
export type LinkId = string;

/**
 * The twelve supported item types (AC-01.2.1). `choice` and `open-choice` are
 * domain concepts here, not R4 codes: an R5 codec would map `coding` plus
 * `answerConstraint` onto them (ADR-0016).
 *
 * @beta
 */
export type ItemType =
  | 'group'
  | 'display'
  | 'boolean'
  | 'decimal'
  | 'integer'
  | 'date'
  | 'dateTime'
  | 'string'
  | 'text'
  | 'choice'
  | 'open-choice'
  | 'quantity';

/** Every item type once: a key missing from or added to `ItemType` fails to compile. */
const ITEM_TYPE_KEYS: Readonly<Record<ItemType, true>> = {
  group: true,
  display: true,
  boolean: true,
  decimal: true,
  integer: true,
  date: true,
  dateTime: true,
  string: true,
  text: true,
  choice: true,
  'open-choice': true,
  quantity: true,
};

export const ITEM_TYPES = Object.keys(ITEM_TYPE_KEYS) as readonly ItemType[];

const SUPPORTED: ReadonlySet<string> = new Set(ITEM_TYPES);

export function isItemType(value: string): value is ItemType {
  return SUPPORTED.has(value);
}

/**
 * `enableWhen` operators (AC-02.1.3).
 *
 * @beta
 */
export type Operator = 'exists' | '=' | '!=' | '>' | '<' | '>=' | '<=';

const OPERATOR_KEYS: Readonly<Record<Operator, true>> = { exists: true, '=': true, '!=': true, '>': true, '<': true, '>=': true, '<=': true };

export const OPERATORS = Object.keys(OPERATOR_KEYS) as readonly Operator[];

const KNOWN_OPERATORS: ReadonlySet<string> = new Set(OPERATORS);

export function isOperator(value: string): value is Operator {
  return KNOWN_OPERATORS.has(value);
}
