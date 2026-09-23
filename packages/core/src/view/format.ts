import type { Answer } from '../index.js';
import { parseDateTime, type PartialDate } from '../kernel/temporal.js';
import type { PluralMessage } from './messages/en.js';

/**
 * Every use of `Intl` in core (ADR-0020, NFR-I-04): dates, numbers, counts
 * and lists, formatted from the locale and zone the host passed and nothing
 * ambient. No date is formatted in the environment's zone:
 * - a `date` is formatted at its authored precision from UTC midnight, in UTC,
 *   so no offset can move the day;
 * - a `dateTime` with a time is formatted in `timeZone` when the host gave
 *   one, and otherwise at its own offset, by formatting its wall clock in UTC.
 *
 * Formatters are cached by what they were built from; the keys are bounded by
 * the locales and zones a host uses.
 */

const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.ListFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.PluralRules | Intl.ListFormat>(
  make: new (locale: string, options: object) => T,
  locale: string,
  options: object,
): T {
  const key = `${make.name}|${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key) as T | undefined;
  if (formatter === undefined) {
    formatter = new make(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

/** Fills `{name}` placeholders. A function replacer, so `$` in a value is never a pattern. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

/** Picks the plural form, then fills `{count}` and anything else given. */
export function plural(message: PluralMessage, count: number, locale: string, values: Readonly<Record<string, string>> = {}): string {
  const form = cached(Intl.PluralRules, locale, {}).select(count) === 'one' ? message.one : message.other;
  return fill(form, { ...values, count: formatNumber(count, locale) });
}

/**
 * A number in the locale. `digits` is the scale to show: a decimal's trailing
 * zeros are significant in a clinical value (ADR-0020), so the view passes
 * the scale of the text that was typed. Never rounded.
 */
export function formatNumber(value: number, locale: string, digits = 0): string {
  return cached(Intl.NumberFormat, locale, { minimumFractionDigits: digits, maximumFractionDigits: 20 }).format(value);
}

/** Digits after the point of a number written as text: `0.50` has 2. */
export function scaleOf(text: string): number {
  return /\.(\d+)/.exec(text)?.[1]?.length ?? 0;
}

/** Items joined as the locale joins a list: `A, B and C`. */
export function formatList(items: readonly string[], locale: string): string {
  return cached(Intl.ListFormat, locale, {}).format(items);
}

/** A UTC instant for a calendar date and wall clock, years 0–99 included. */
function instant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second);
  return date.getTime();
}

/** A FHIR `date` or date-precision `dateTime`, at its authored precision, never moved by an offset. */
function formatDate({ precision, year, month, day }: PartialDate, locale: string): string {
  const options = { timeZone: 'UTC', year: 'numeric', ...(precision === 'year' ? {} : { month: 'long' }), ...(precision === 'day' ? { day: 'numeric' } : {}) };
  return cached(Intl.DateTimeFormat, locale, options).format(instant(year, month || 1, day || 1));
}

/**
 * A FHIR `date` or `dateTime` as text for reading. A time of day is shown in
 * `timeZone`, or at its own offset without one; a date never passes through a zone.
 */
export function formatDateTime(value: string, locale: string, timeZone: string | undefined): string {
  const parsed = parseDateTime(value);
  if (parsed === null) return value;
  if (parsed.offsetMinutes === null) return formatDate(parsed as PartialDate, locale);
  const { year, month, day, hour, minute, second, offsetMinutes } = parsed;
  // The authored wall clock, read as if in UTC: formatted in UTC it is the time as written.
  const wall = instant(year, month, day, hour, minute, second);
  const options = { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone ?? 'UTC' };
  return cached(Intl.DateTimeFormat, locale, options).format(timeZone === undefined ? wall : wall - offsetMinutes * 60_000);
}

/**
 * The UTC offset, in minutes, that a wall-clock time has in `timeZone`,
 * taken from `Intl` rather than any table, as Temporal's `compatible` reads
 * one: of the zone's offsets half a day either side, the one that puts the
 * instant back on that wall clock; the earlier when both do (a time that
 * happens twice), and the one before the change when neither does (a time a
 * change skips, which then lands after the gap).
 */
export function offsetIn(timeZone: string, year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const wall = instant(year, month, day, hour, minute, second);
  const before = zoneOffset(timeZone, wall - 43_200_000);
  const after = zoneOffset(timeZone, wall + 43_200_000);
  const fits = (offset: number) => zoneOffset(timeZone, wall - offset * 60_000) === offset;
  return !fits(before) && fits(after) ? after : before;
}

function zoneOffset(timeZone: string, at: number): number {
  const options = { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
  const parts: Record<string, number> = {};
  for (const { type, value } of cached(Intl.DateTimeFormat, 'en-US', options).formatToParts(at)) parts[type] = Number(value);
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = parts;
  return Math.round((instant(year, month, day, hour, minute, second) - Math.floor(at / 1000) * 1000) / 60_000);
}

/** An answer as text for reading (ADR-0020). A coding reads as its display, else its code; a boolean is the catalogue's. */
export function formatAnswer(answer: Exclude<Answer, { readonly kind: 'boolean' }>, locale: string, timeZone: string | undefined, scale?: number): string {
  switch (answer.kind) {
    case 'integer':
      return formatNumber(answer.value, locale);
    case 'decimal':
      return formatNumber(answer.value, locale, scale ?? scaleOf(String(answer.value)));
    case 'date':
    case 'dateTime':
      return formatDateTime(answer.value, locale, timeZone);
    case 'quantity': {
      const { value, unit, code } = answer.value;
      // UCUM codes are not Intl units: the authored unit text is appended verbatim (ADR-0020).
      const number = formatNumber(value, locale, scale ?? scaleOf(String(value)));
      const shown = unit ?? code;
      return shown === undefined ? number : `${number} ${shown}`;
    }
    case 'coding':
      return answer.value.display ?? answer.value.code ?? '';
    default:
      return answer.value;
  }
}
