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
