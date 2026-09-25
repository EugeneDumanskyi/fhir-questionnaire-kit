/**
 * A well-formed Unicode BCP 47 locale identifier, the grammar `Intl` accepts
 * (UTS #35): language, then script, region, variants, extensions and a
 * private use part, each optional. `lang="en_US"`, common on older pages,
 * is not one, and `Intl` would throw on it at the first date it formats.
 */
const TAG = /^([a-z]{2,3}|[a-z]{5,8})(-[a-z]{4})?(-([a-z]{2}|\d{3}))?(-([a-z\d]{5,8}|\d[a-z\d]{3}))*(-[a-wyz\d](-[a-z\d]{2,8})+)*(-x(-[a-z\d]{1,8})+)?$/i;

/**
 * The element's locale (ADR-0020, M7 plan D5): the `locale` property, else
 * the `lang` of the element or its nearest ancestor that has one, else the
 * browser's language, else `"en"`. A candidate that is not a well-formed tag
 * is passed over for the next. A script tag has nowhere else to say it, which
 * is why this file, and only this one, may read the browser's language: the
 * React adapter never sniffs (ADR-0012's asymmetry).
 */
export function localeOf(locale: string | null, element: Element): string {
  const candidates = [locale, element.closest('[lang]')?.getAttribute('lang'), navigator.language];
  return candidates.find((tag): tag is string => typeof tag === 'string' && TAG.test(tag)) ?? 'en';
}
