import { afterEach, describe, expect, it, vi } from 'vitest';

import { localeOf } from '../../src/locale.js';

/**
 * The element's locale fallback (ADR-0020, M7 plan D5): `locale`, then the
 * `lang` of the element or its nearest ancestor, then the browser's
 * language, then `"en"`, each candidate taken only when `Intl` would take it.
 */

const placed: Element[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const outer of placed.splice(0)) outer.remove();
  document.documentElement.removeAttribute('lang');
});

/** An element under a parent, each with the `lang` given, `undefined` for none, in the document. */
function place(own: string | undefined, parent: string | undefined): Element {
  const outer = document.createElement('div');
  const inner = document.createElement('fhir-questionnaire-probe');
  if (own !== undefined) inner.setAttribute('lang', own);
  if (parent !== undefined) outer.setAttribute('lang', parent);
  outer.append(inner);
  document.body.append(outer);
  placed.push(outer);
  return inner;
}

const browser = (language: string) => vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);

describe('the fallback matrix', () => {
  const rows: [string, string | null, string | undefined, string | undefined, string, string][] = [
    // name, locale property, own lang, ancestor lang, browser, expected
    ['the property over everything', 'fr-CA', 'de', 'it', 'es', 'fr-CA'],
    ['the element’s own lang over its ancestors', null, 'de', 'it', 'es', 'de'],
    ['the nearest ancestor’s lang', null, undefined, 'it', 'es', 'it'],
    ['the browser’s language with no lang anywhere', null, undefined, undefined, 'es-MX', 'es-MX'],
    ['a malformed property passed over for lang', 'en_US', 'de', undefined, 'es', 'de'],
    ['a malformed lang passed over for the browser', null, 'en_US', 'it', 'es', 'es'],
    ['an empty lang, which means unknown, passed over for the browser', null, '', 'it', 'es', 'es'],
    ['"en" when nothing is usable', null, 'x', undefined, '', 'en'],
  ];

  for (const [name, property, own, ancestor, language, expected] of rows) {
    it(name, () => {
      browser(language);
      expect(localeOf(property, place(own, ancestor))).toBe(expected);
    });
  }

  it('the document’s own lang, for an element with no other', () => {
    browser('es');
    document.documentElement.setAttribute('lang', 'pt-BR');
    expect(localeOf(null, place(undefined, undefined))).toBe('pt-BR');
  });
});

describe('a well-formed tag is one Intl takes', () => {
  const tags = [
    'en', 'de', 'fil', 'en-US', 'zh-Hant-TW', 'es-419', 'sr-Latn-RS', 'de-CH-1996', 'sl-rozaj-biske', 'en-u-ca-gregory',
    'de-DE-u-co-phonebk', 'en-US-x-twain', 'en_US', 'e', 'english!', 'en-', '-en', 'en--US', 'en-US-', '12', 'en-x', 'toolonglanguage',
  ];

  for (const tag of tags) {
    it(tag, () => {
      let taken: boolean;
      try {
        Intl.getCanonicalLocales(tag);
        taken = true;
      } catch {
        taken = false;
      }
      browser('');
      expect(localeOf(tag, document.body) === tag).toBe(taken);
    });
  }
});
