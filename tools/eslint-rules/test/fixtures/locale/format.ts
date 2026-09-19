// view/format: Intl with the locale the host passed, and nothing ambient.
export function plural(count: number, locale: string): string {
  return `${new Intl.PluralRules(locale).select(count)} ${new Intl.NumberFormat(locale).format(count)}`;
}
