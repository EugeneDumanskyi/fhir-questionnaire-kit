import { parseDate, parseDateTime } from './temporal.js';

/** Answer values the S1 slice's session still uses. Removed when M2's session replaces it. */
export type AnswerValue = boolean | string;

/** A coded value. Compared on `system` and `code`; `display` is for people (M2 plan D3). */
export interface Coding {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

export interface Quantity {
  readonly value: number;
  readonly unit?: string;
  readonly system?: string;
  readonly code?: string;
}

/**
 * One typed answer (`04-domain.md` §3.2). The kind is the value's type, not
 * the item's: a `text` item holds `string` answers, and a `choice` item holds
 * whichever kind its options have (M2 plan D4). FHIR `date` and `dateTime`
 * stay distinct strings with their precision as written.
 */
export type Answer =
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'decimal'; readonly value: number }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'date'; readonly value: string }
  | { readonly kind: 'dateTime'; readonly value: string }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'coding'; readonly value: Coding }
  | { readonly kind: 'quantity'; readonly value: Quantity };

export type AnswerKind = Answer['kind'];

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

const VALUE_CHECKS: Readonly<Record<AnswerKind, (value: unknown) => boolean>> = {
  boolean: (value) => typeof value === 'boolean',
  decimal: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => typeof value === 'number' && Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX,
  date: (value) => typeof value === 'string' && parseDate(value) !== null,
  dateTime: (value) => typeof value === 'string' && parseDateTime(value) !== null,
  string: (value) => typeof value === 'string' && value !== '',
  coding: (value) => isCoding(value),
  quantity: (value) => isQuantity(value),
};

/**
 * Whether an untrusted value is a well-formed answer. Hosts call the engine
 * from plain JavaScript, so a command's payload is checked, not trusted: a
 * malformed one is refused, never stored (`04-domain.md` §7.1).
 */
export function isAnswer(candidate: unknown): candidate is Answer {
  if (!isRecord(candidate) || typeof candidate['kind'] !== 'string') return false;
  const check = Object.hasOwn(VALUE_CHECKS, candidate['kind']) ? VALUE_CHECKS[candidate['kind'] as AnswerKind] : undefined;
  return check !== undefined && check(candidate['value']);
}

/** A coding names at least a code or a display; each part present is a non-empty string. */
export function isCoding(value: unknown): value is Coding {
  if (!isRecord(value)) return false;
  const { system, code, display } = value;
  return optionalText(system) && optionalText(code) && optionalText(display) && (code !== undefined || display !== undefined);
}

function isQuantity(value: unknown): value is Quantity {
  if (!isRecord(value)) return false;
  const { value: amount, unit, system, code } = value;
  return typeof amount === 'number' && Number.isFinite(amount) && optionalText(unit) && optionalText(system) && optionalText(code);
}

function optionalText(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value !== '');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A frozen copy holding only the fields the kit reads, so a host that mutates
 * the object it dispatched cannot reach into engine state afterwards.
 */
export function copyAnswer(answer: Answer): Answer {
  switch (answer.kind) {
    case 'coding': {
      const { system, code, display } = answer.value;
      return Object.freeze({ kind: answer.kind, value: Object.freeze(present({ system, code, display })) });
    }
    case 'quantity': {
      const { value, unit, system, code } = answer.value;
      return Object.freeze({ kind: answer.kind, value: Object.freeze({ value, ...present({ unit, system, code }) }) });
    }
    default:
      return Object.freeze({ ...answer });
  }
}

/** Structural equality over the fields the kit reads. */
export function sameAnswer(a: Answer, b: Answer): boolean {
  if (a.kind !== b.kind) return false;
  if (typeof a.value !== 'object') return a.value === b.value;
  const left: Readonly<Record<string, unknown>> = { ...a.value };
  const right: Readonly<Record<string, unknown>> = { ...(b.value as object) };
  return ['value', 'unit', 'system', 'code', 'display'].every((key) => left[key] === right[key]);
}

/** The string fields that are present, so a copy never carries an `undefined` property. */
function present<T extends Readonly<Record<string, string | undefined>>>(fields: T): { [K in keyof T]?: string } {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => typeof value === 'string')) as { [K in keyof T]?: string };
}
