import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TOKENS } from '../src/index.js';

/**
 * M8 AC-9, NFR-U-02: `examples/themed-host` matches a host design system in
 * at most 30 lines of CSS and no JavaScript, through tokens alone (ADR-0013
 * tier 2). Both renderers are checked to read it in browsers by
 * `tests/browser/themed-host.spec.ts`.
 */

const at = (path: string) => new URL(`../../../examples/themed-host/${path}`, import.meta.url);
const read = (path: string) => readFileSync(at(path), 'utf8');
const THEME = read('theme.css');

/** Every line that is not blank. The theme holds no comments, so none are left out. */
const counted = (source: string) => source.split('\n').filter((line) => line.trim() !== '');

describe('the tier-2 worked example (M8 AC-9)', () => {
  it('is 20 lines of CSS: NFR-U-02 allows 30', () => {
    expect(THEME).not.toMatch(/\/\*/);
    expect(counted(THEME)).toHaveLength(20);
  });

  it('declares tokens and nothing else, each from the documented set, and each read from the design system', () => {
    const declarations = [...THEME.matchAll(/^\s*([a-z-]+)\s*:\s*([^;]+);/gm)];
    expect(declarations.length).toBeGreaterThan(0);
    for (const [, property = '', value = ''] of declarations) {
      expect(TOKENS, property).toContain(property);
      expect(value, property).toMatch(/var\(--ds-[a-z-]+\)/);
    }
  });

  it('is what the README shows, verbatim (NFR-Q-08)', () => {
    expect(read('README.md').match(/```css\n([\s\S]*?)```/)?.[1]).toBe(THEME);
  });

  it('has no JavaScript: the page loads the element and the two stylesheets, and nothing else', () => {
    const page = read('index.html');
    // `react.ts` is the React host's stylesheet imports the README shows (M10 plan step 3), and nothing more.
    expect(readdirSync(at('.')).filter((file) => /\.[cm]?[jt]sx?$/.test(file) && file !== 'fhirq-element.js')).toEqual(['react.ts']);
    expect(read('react.ts').split('\n').filter((line) => !/^import '[^']+\.css';$/.test(line) && line !== '')).toEqual([]);
    expect(page.match(/<script\b[^>]*>/g)).toEqual(['<script src="fhirq-element.js">']);
    expect(page.match(/<link\b[^>]*>/g)).toEqual(['<link rel="stylesheet" href="design-system.css">', '<link rel="stylesheet" href="theme.css">']);
    expect(page).not.toMatch(/<style\b|\sstyle=|\son[a-z]+=/i);
  });

  it('names the demonstration form, unchanged', () => {
    const json = (url: URL): unknown => JSON.parse(readFileSync(url, 'utf8'));
    expect(json(at('demo.json'))).toEqual(json(new URL('../../../fixtures/demo/questionnaire.json', import.meta.url)));
  });
});
