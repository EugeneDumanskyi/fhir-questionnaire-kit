import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TOKENS } from '../src/index.js';

const read = (name: string) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const base = read('base.css');
const preset = read('default.css');
const [light = '', dark = ''] = preset.split('@media (prefers-color-scheme: dark)');

const declared = (css: string) => new Set([...css.matchAll(/(--fhirq-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const properties = (css: string) => [...css.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1] ?? '');

describe('base.css (ADR-0013)', () => {
  it('reads only tokens the contract names', () => {
    const used = new Set([...base.matchAll(/var\((--fhirq-[a-z0-9-]+)\)/g)].map((m) => m[1]));
    expect([...used].filter((token) => !(TOKENS as readonly (string | undefined)[]).includes(token))).toEqual([]);
  });

  it('carries no literal colour and no spacing outside the visually-hidden technique', () => {
    expect(base).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    const withoutStatus = base.replace(/\.fhirq-status\s*\{[^}]*\}/, '');
    expect(withoutStatus).not.toMatch(/\d(px|rem|em)\b/);
  });

  it('uses logical properties only (NFR-I-05)', () => {
    const physical = /^(margin|padding|border)-(left|right|top|bottom)|^(left|right|top|bottom|width|height|min-width|max-width|min-height|max-height)$/;
    expect(properties(base).filter((name) => physical.test(name))).toEqual([]);
  });
});

describe('default.css preset', () => {
  it('declares every token, and nothing but tokens', () => {
    expect([...declared(light)].sort()).toEqual([...TOKENS].sort());
    expect(properties(preset).filter((name) => name !== '' && !name.startsWith('--'))).toEqual([]);
  });

  it('redeclares every colour token for dark', () => {
    expect([...declared(dark)].sort()).toEqual(TOKENS.filter((token) => token.startsWith('--fhirq-color-')).sort());
  });
});

/** WCAG 2.2 relative luminance and contrast ratio, for #rrggbb. */
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};
const colours = (css: string) => new Map([...css.matchAll(/--fhirq-color-([a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]));

/**
 * Every foreground the default UI draws against the two surfaces it draws on.
 * Text is 4.5:1 (1.4.3); borders, the error bar, the radio's accent and the
 * focus ring are non-text UI at 3:1 (1.4.11, 2.4.13's contrast half).
 */
const PAIRS: readonly (readonly [foreground: string, minimum: number])[] = [
  ['text', 4.5],
  ['text-muted', 4.5],
  ['error', 4.5],
  ['accent', 4.5],
  ['border', 3],
  ['focus', 3],
];

describe('default.css contrast (NFR-A-03, NFR-A-04)', () => {
  const schemes = { light: colours(light), dark: new Map([...colours(light), ...colours(dark)]) };

  it('writes every colour as #rrggbb, so it can be measured', () => {
    for (const scheme of Object.values(schemes)) for (const value of scheme.values()) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('measures a known pair as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  for (const [name, scheme] of Object.entries(schemes))
    for (const surface of ['background', 'control-background'])
      for (const [foreground, minimum] of PAIRS)
        it(`${name}: ${foreground} on ${surface} is at least ${minimum}:1`, () => {
          const [fg, bg] = [scheme.get(foreground), scheme.get(surface)];
          expect(fg && bg ? contrast(fg, bg) : 0).toBeGreaterThanOrEqual(minimum);
        });
});
