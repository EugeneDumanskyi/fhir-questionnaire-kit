import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { CORE_FILES, CORE_IMPORTERS, CORE_MODULES } from '../../../eslint.config.js';
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

describe('core-module-imports', () => {
  const rule = 'core-module-imports';
  const dir = `${fixtures}/${rule}/src`;
  const options = { root: dir, modules: CORE_MODULES, files: CORE_FILES, importers: CORE_IMPORTERS };
  const lint = (file, with_ = options) => lintFixture(`${dir}/${file}`, rule, with_);

  it.each([
    ['kernel/must-fail.ts', ['session/store']],
    ['definition/must-fail.ts', ['fhir/r4/types', 'session/store', 'validation/rules']],
    ['session/must-fail.ts', ['fhir/r4/types', 'validation/required', 'view/view']],
    ['validation/must-fail.ts', ['session/store']],
    ['view/must-fail.ts', ['session/session']],
    ['fhir/r4/must-fail.ts', ['definition/compile']],
  ])('fails %s on every import its §4.1 row does not allow', (file, targets) => {
    const messages = lint(file);
    expect(ruleIds(messages)).toEqual(Array(targets.length).fill(`fhirq/${rule}`));
    targets.forEach((target, index) => expect(messages[index].message).toContain(`reaches ${target} from`));
  });

  it.each([
    'index.ts',
    'resume.ts',
    'definition/must-pass.ts',
    'validation/must-pass.ts',
    'view/must-pass.ts',
    'interchange/must-pass.ts',
    'interchange/hydrate.ts',
    'session/snapshot.ts',
  ])(
    'passes %s',
    (file) => {
      expect(lint(file)).toEqual([]);
    },
  );

  it('fails a file in a module the table does not list', () => {
    const messages = lint('stray/must-fail.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('in no module of the §4.1 import table');
  });

  it('holds emission to the projection by its file row (AC-05.3.2), and the snapshot to its importers', () => {
    const messages = lint('interchange/emit.ts');
    expect(ruleIds(messages)).toEqual([`fhirq/${rule}`, `fhirq/${rule}`]);
    expect(messages[0].message).toContain('reaches session/store from');
    expect(messages[1].message).toContain('reaches session/snapshot, which only resume, interchange/hydrate may import');
  });

  it('opens the state registry to session/session and session/snapshot only (ADR-0021)', () => {
    const messages = lint('session/must-fail-registry.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('reaches session/registry, which only session/session, session/snapshot may import');
  });

  it('keeps the resume path out of anything view or index reach (ADR-0021)', () => {
    expect(lint('view/must-fail-resume.ts').map((message) => message.message)).toEqual([
      expect.stringContaining('reaches resume, which only no file may import'),
      expect.stringContaining('reaches session/snapshot, which only'),
    ]);
    // `leaky.ts` stands in for `index.ts`, under index's own row.
    const leaky = lint('leaky.ts', { ...options, files: { ...CORE_FILES, leaky: CORE_FILES.index } });
    expect(leaky.map((message) => message.message)).toEqual([
      expect.stringContaining('reaches resume, which only'),
      expect.stringContaining('reaches interchange/decode, which only interchange/hydrate may import'),
      expect.stringContaining('reaches fhir/r4/decode, which only resume may import'),
    ]);
  });

  it('fails a root file with no row', () => {
    const messages = lint('unlisted.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('in no module of the §4.1 import table');
  });

  it('holds the rows 05-architecture.md §4.1 states', () => {
    expect(CORE_MODULES.kernel).toEqual([]);
    expect(CORE_MODULES.ports).toEqual(['kernel']);
    expect(CORE_MODULES.session).not.toContain('validation');
    expect(Object.entries(CORE_MODULES).filter(([, allowed]) => allowed.includes('fhir/r4'))).toEqual([
      ['interchange', CORE_MODULES.interchange],
    ]);
    expect(CORE_FILES['interchange/emit'].filter((entry) => entry.startsWith('session'))).toEqual(['session/projection']);
    expect(CORE_IMPORTERS['session/registry']).toEqual(['session/session', 'session/snapshot']);
    expect(Object.values(CORE_FILES).flat()).not.toContain('resume');
  });
});

describe('no-fhir-shapes-outside-codec', () => {
  const rule = 'no-fhir-shapes-outside-codec';
  const options = { allow: [`${fixtures}/${rule}/fhir/**`] };

  it('fails on a resourceType declared, quoted and read outside the codec', () => {
    const messages = lintFixture(`${fixtures}/${rule}/must-fail.ts`, rule, options);
    expect(ruleIds(messages)).toEqual(Array(4).fill(`fhirq/${rule}`));
    expect(messages[0].message).toContain('ADR-0016');
  });

  it('passes on domain types', () => {
    expect(lintFixture(`${fixtures}/${rule}/must-pass.ts`, rule, options)).toEqual([]);
  });

  it('passes inside the codec, and only because it is allowed', () => {
    const codec = `${fixtures}/${rule}/fhir/codec.ts`;
    expect(lintFixture(codec, rule, options)).toEqual([]);
    expect(lintFixture(codec, rule, { allow: [] })).toHaveLength(2);
  });
});
