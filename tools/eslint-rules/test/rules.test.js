import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fhirqPlugin } from '../src/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const fixtures = 'tools/eslint-rules/test/fixtures';
const linter = new Linter({ configType: 'flat', cwd: root });

/**
 * Lints a fixture file on disk, exactly as `pnpm lint` would, so the "fixture
 * that must fail" of AC-6 is a real file and not a string in a test.
 */
function lintFixture(relativePath, rule, options) {
  const code = readFileSync(`${root}/${relativePath}`, 'utf8');
  return linter.verify(
    code,
    {
      files: ['**/*.ts'],
      plugins: { fhirq: fhirqPlugin },
      languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: false } },
      },
      rules: { [`fhirq/${rule}`]: options === undefined ? 'error' : ['error', options] },
    },
    `${root}/${relativePath}`,
  );
}

const ruleIds = (messages) => messages.map((message) => message.ruleId);

describe('no-dom-in-core', () => {
  const rule = 'no-dom-in-core';

  it('fails on the fixture that touches the DOM, storage and timers', () => {
    const messages = lintFixture(`${fixtures}/${rule}/must-fail.ts`, rule);
    expect(ruleIds(messages)).toEqual(Array(5).fill(`fhirq/${rule}`));
    const text = messages.map((message) => message.message).join('\n');
    expect(text).toContain("'document'");
    expect(text).toContain("'window'");
    expect(text).toContain("'localStorage'");
    expect(text).toContain("'HTMLElement'");
  });

  it('passes on the DOM-free fixture, including a local binding named document', () => {
    expect(lintFixture(`${fixtures}/${rule}/must-pass.ts`, rule)).toEqual([]);
  });
});

describe('no-network', () => {
  const rule = 'no-network';
  const options = { allow: [`${fixtures}/no-network/allowed.ts`] };

  it('fails on the fixture that opens connections from a file that may not', () => {
    const messages = lintFixture(`${fixtures}/${rule}/must-fail.ts`, rule, options);
    const text = messages.map((message) => message.message).join('\n');
    expect(messages).toHaveLength(4);
    for (const name of ['fetch', 'WebSocket', 'EventSource', 'sendBeacon']) {
      expect(text).toContain(`'${name}'`);
    }
  });

  it('passes on the fixture that takes its data from an injected port', () => {
    expect(lintFixture(`${fixtures}/${rule}/must-pass.ts`, rule, options)).toEqual([]);
  });

  it('passes on the one allowed path, and only because it is listed', () => {
    const allowed = `${fixtures}/${rule}/allowed.ts`;
    expect(lintFixture(allowed, rule, options)).toEqual([]);
    expect(lintFixture(allowed, rule, { allow: [] })).toHaveLength(1);
  });
});

describe('no-hardcoded-user-strings', () => {
  const rule = 'no-hardcoded-user-strings';
  const options = { catalogue: [`${fixtures}/${rule}/catalogue.ts`] };

  it('fails on the fixture that writes prose outside the catalogue', () => {
    const messages = lintFixture(`${fixtures}/${rule}/must-fail.ts`, rule, options);
    expect(messages).toHaveLength(3);
    expect(messages[0].message).toContain('message catalogue');
  });

  it('passes on codes, paths, keys, type literals and FHIR system URLs', () => {
    expect(lintFixture(`${fixtures}/${rule}/must-pass.ts`, rule, options)).toEqual([]);
  });

  it('passes inside the catalogue, and fails on the same file outside it', () => {
    const catalogue = `${fixtures}/${rule}/catalogue.ts`;
    expect(lintFixture(catalogue, rule, options)).toEqual([]);
    expect(lintFixture(catalogue, rule, { catalogue: [] })).toHaveLength(2);
  });
});

describe('no-deep-imports', () => {
  const rule = 'no-deep-imports';
  const options = {
    entryPoints: {
      '@fhirq/core': ['@fhirq/core', '@fhirq/core/view'],
      '@fhirq/react': ['@fhirq/react'],
    },
  };

  it('fails on a subpath import and on a relative climb into another package', () => {
    const messages = lintFixture(`${fixtures}/${rule}/must-fail.ts`, rule, options);
    expect(messages).toHaveLength(2);
    expect(messages[0].message).toContain('not a published entry point');
    expect(messages[1].message).toContain('climbs out of');
  });

  it('passes on published entry points and same-package relative imports', () => {
    expect(lintFixture(`${fixtures}/${rule}/must-pass.ts`, rule, options)).toEqual([]);
  });
});
