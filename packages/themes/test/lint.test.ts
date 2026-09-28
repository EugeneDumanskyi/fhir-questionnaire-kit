import { fileURLToPath } from 'node:url';

import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

/**
 * M8 AC-3: stylelint holds the stylesheets to tokens only, with no literal
 * colour or length and nothing tied to a physical side (NFR-I-05). `pnpm lint`
 * runs it over `src/`; this proves each rule bites, and bites nothing else,
 * on the fixtures in `fixtures/`.
 */

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const configFile = path('../../../stylelint.config.js');

/** Each rule a file breaks, with how many times. */
const broken = async (file: string) => {
  const { results } = await stylelint.lint({ files: path(file), configFile });
  const counts: Record<string, number> = {};
  for (const result of results) for (const warning of result.warnings) counts[warning.rule] = (counts[warning.rule] ?? 0) + 1;
  return counts;
};

describe('stylelint over the themes (M8 AC-3)', () => {
  it('passes the published stylesheets', async () => {
    expect(await broken('../src/base.css')).toEqual({});
    expect(await broken('../src/default.css')).toEqual({});
  });

  it('passes tokens, 0, %, logical properties and symmetric shorthands', async () => {
    expect(await broken('fixtures/symmetric.css')).toEqual({});
  });

  const MUST_FAIL: readonly (readonly [file: string, rules: Record<string, number>])[] = [
    ['hex-colour.css', { 'color-no-hex': 2 }],
    ['named-colour.css', { 'color-named': 1 }],
    ['colour-function.css', { 'function-disallowed-list': 2 }],
    ['literal-length.css', { 'unit-allowed-list': 3 }],
    ['physical-property.css', { 'property-disallowed-list': 5 }],
    ['physical-value.css', { 'declaration-property-value-disallowed-list': 6 }],
    ['undescribed-disable.css', { '--report-descriptionless-disables': 1 }],
    ['preset/default.css', { 'color-hex-length': 1, 'property-allowed-list': 1 }],
  ];

  for (const [file, rules] of MUST_FAIL)
    it(`fails ${file} for ${Object.keys(rules).join(' and ')}`, async () => {
      expect(await broken(`fixtures/${file}`)).toEqual(rules);
    });
});
