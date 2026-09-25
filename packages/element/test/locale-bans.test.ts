import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0020 on the element (M7 plan step 2): the repository's configuration
 * applies the element's locale rules to every file in `src` but one, and that
 * one, `src/locale.ts`, only to the renderer's. The rules themselves have
 * their must-fail fixture in `tools/eslint-rules/test/rules.test.js`.
 */
const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../..', import.meta.url)) });
const source = (file: string) => fileURLToPath(new URL(`../src/${file}`, import.meta.url));

interface Restriction {
  readonly object?: string;
  readonly property?: string;
  readonly name?: string;
}

async function restricted(file: string) {
  const { rules = {} } = (await eslint.calculateConfigForFile(source(file))) as { rules?: Record<string, readonly unknown[]> };
  const options = (rule: string) => (rules[rule] ?? []).slice(1) as Restriction[];
  return {
    properties: options('no-restricted-properties').map(({ object, property }) => `${object ?? '*'}.${property ?? '*'}`),
    globals: options('no-restricted-globals').map(({ name }) => name),
  };
}

describe("the element's locale lint (ADR-0020)", () => {
  it("bans Intl, ambient-locale calls and the browser's language in the element's files", async () => {
    for (const file of ['element.ts', 'items.ts', 'iife.ts']) {
      const { properties, globals } = await restricted(file);
      expect(globals, file).toEqual(['Intl']);
      expect(properties, file).toEqual(expect.arrayContaining(['*.toLocaleDateString', '*.resolvedOptions', 'navigator.language', 'navigator.languages', 'window.navigator', 'globalThis.navigator']));
    }
  });

  it("lets src/locale.ts read the browser's language, and nothing else ambient", async () => {
    const { properties, globals } = await restricted('locale.ts');
    expect(globals).toEqual(['Intl']);
    expect(properties).toEqual(expect.arrayContaining(['*.toLocaleDateString', '*.resolvedOptions']));
    expect(properties.filter((property) => property.includes('navigator'))).toEqual([]);
  });
});
