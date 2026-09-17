import type { PluralMessage } from './messages/en.js';

/**
 * Picks the plural form and formats the count, through `Intl` only
 * (NFR-I-04). The locale is fixed at `en` in the slice; ADR-0020's explicit
 * `locale` option is M5.
 */
export function plural(message: PluralMessage, count: number, locale = 'en'): string {
  const category = new Intl.PluralRules(locale).select(count);
  const template = category === 'one' ? message.one : message.other;
  return fill(template, { count: new Intl.NumberFormat(locale).format(count) });
}

/** Fills `{name}` placeholders. A function replacer, so `$` in a value is never a pattern. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}
