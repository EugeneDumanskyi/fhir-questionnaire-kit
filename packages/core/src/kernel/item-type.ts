/**
 * An item definition's identity (`04-domain.md` §1). Unique across the whole
 * item tree (INV-D-02). A plain alias: it documents intent in signatures, and
 * a brand would buy nothing the uniqueness check does not already give.
 */
export type LinkId = string;

/**
 * The twelve supported item types (AC-01.2.1). `choice` and `open-choice` are
 * domain concepts here, not R4 codes: an R5 codec would map `coding` plus
 * `answerConstraint` onto them (ADR-0016).
 */
export const ITEM_TYPES = [
  'group',
  'display',
  'boolean',
  'decimal',
  'integer',
  'date',
  'dateTime',
  'string',
  'text',
  'choice',
  'open-choice',
  'quantity',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

const SUPPORTED: ReadonlySet<string> = new Set(ITEM_TYPES);

export function isItemType(value: string): value is ItemType {
  return SUPPORTED.has(value);
}

/** `enableWhen` operators (AC-02.1.3). */
export const OPERATORS = ['exists', '=', '!=', '>', '<', '>=', '<='] as const;

export type Operator = (typeof OPERATORS)[number];

const KNOWN_OPERATORS: ReadonlySet<string> = new Set(OPERATORS);

export function isOperator(value: string): value is Operator {
  return KNOWN_OPERATORS.has(value);
}
