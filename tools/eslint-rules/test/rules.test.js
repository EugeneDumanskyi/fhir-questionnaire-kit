import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tsParser from '@typescript-eslint/parser';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

import { CORE_FILES, CORE_IMPORTERS, CORE_MODULES, CORE_TYPES_ONLY, LOCALE_RULES } from '../../../eslint.config.js';
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
  const jsx = relativePath.endsWith('.tsx');
  return linter.verify(
    code,
    {
      files: [jsx ? '**/*.tsx' : '**/*.ts'],
      plugins: { fhirq: fhirqPlugin },
      languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx } },
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

describe('no-dom-in-render (ADR-0015, M6)', () => {
  const rule = 'no-dom-in-render';
  const lintTsx = (file) =>
    linter.verify(
      readFileSync(`${root}/${fixtures}/${rule}/${file}`, 'utf8'),
      {
        files: ['**/*.tsx'],
        plugins: { fhirq: fhirqPlugin },
        languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { [`fhirq/${rule}`]: 'error' },
      },
      `${root}/${fixtures}/${rule}/${file}`,
    );

  it('fails on module scope, render bodies and the callbacks React calls during render', () => {
    const messages = lintTsx('must-fail.tsx');
    const marked = readFileSync(`${root}/${fixtures}/${rule}/must-fail.tsx`, 'utf8')
      .split('\n')
      .flatMap((line, index) => (/\/\/ \d+:/.test(line) ? [index + 1] : []));
    expect(marked).toHaveLength(8);
    expect(messages.every((message) => message.ruleId === `fhirq/${rule}`)).toBe(true);
    expect(messages.map((message) => message.line)).toEqual(marked);
  });

  it('passes on effects, handlers, subscriptions, types and a local named document', () => {
    expect(lintTsx('must-pass.tsx')).toEqual([]);
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

  it('passes on a structural attribute computed in braces, and fails on prose in any other', () => {
    const messages = lintFixture(`${fixtures}/${rule}/jsx.tsx`, rule, options);
    expect(messages.map((message) => message.line)).toEqual([6]);
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
  const options = { root: dir, modules: CORE_MODULES, files: CORE_FILES, importers: CORE_IMPORTERS, typesOnly: CORE_TYPES_ONLY };
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
    'ports/must-pass.ts',
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

  it('keeps ports/ to types: each statement that would emit JavaScript fails (§4.1, M4)', () => {
    const messages = lint('ports/must-fail.ts');
    expect(ruleIds(messages)).toEqual(Array(3).fill(`fhirq/${rule}`));
    expect(messages.map((message) => message.line)).toEqual([2, 5, 7]);
    expect(messages[0].message).toContain('ports/ is types only');
  });

  /**
   * M5 AC-9: every row of the §4.1 table has a fixture that must fail against
   * it. A module row by a file in that module; a file row by the file itself,
   * or by a stand-in linted under the row; an importer rule by a file its list
   * does not name. The keys are the config's own, so a row added to
   * `eslint.config.js` without a fixture fails here.
   */
  const MUST_FAIL = {
    modules: {
      kernel: ['kernel/must-fail.ts', 'reaches session/store from kernel/'],
      'fhir/r4': ['fhir/r4/must-fail.ts', 'reaches definition/compile from fhir/r4/'],
      definition: ['definition/must-fail.ts', 'reaches session/store from definition/'],
      session: ['session/must-fail.ts', 'reaches view/view from session/'],
      validation: ['validation/must-fail.ts', 'reaches session/store from validation/'],
      interchange: ['interchange/must-fail.ts', 'reaches session/store from interchange/'],
      ports: ['ports/must-fail-imports.ts', 'reaches session/store from ports/'],
      view: ['view/must-fail.ts', 'reaches session/session from view/'],
    },
    files: {
      index: ['index-must-fail.ts', 'reaches validation/validate from index-must-fail/'],
      open: ['open.ts', 'reaches view/view from open/'],
      resume: ['resume-must-fail.ts', 'reaches view/view from resume-must-fail/'],
      'interchange/emit': ['interchange/emit.ts', 'reaches session/store from interchange/emit/'],
    },
    importers: {
      'session/registry': ['session/must-fail-registry.ts', 'reaches session/registry, which only'],
      'session/snapshot': ['view/must-fail-resume.ts', 'reaches session/snapshot, which only'],
      'interchange/hydrate': ['interchange/must-fail.ts', 'reaches interchange/hydrate, which only resume may import'],
      'interchange/decode': ['leaky.ts', 'reaches interchange/decode, which only'],
      'fhir/r4/decode': ['leaky.ts', 'reaches fhir/r4/decode, which only'],
      resume: ['view/must-fail-resume.ts', 'reaches resume, which only'],
    },
  };
  /** Stand-ins for the root entry files, each linted under the row it stands in for. */
  const STAND_INS = { 'index-must-fail': CORE_FILES.index, 'resume-must-fail': CORE_FILES.resume, leaky: CORE_FILES.index };

  it('has a must-fail fixture for every row of the §4.1 table (M5 AC-9)', () => {
    expect(Object.keys(MUST_FAIL.modules).sort()).toEqual(Object.keys(CORE_MODULES).sort());
    expect(Object.keys(MUST_FAIL.files).sort()).toEqual(Object.keys(CORE_FILES).sort());
    expect(Object.keys(MUST_FAIL.importers).sort()).toEqual(Object.keys(CORE_IMPORTERS).sort());
  });

  it.each(Object.values(MUST_FAIL).flatMap((rows) => Object.entries(rows)))('fails the row %s by its fixture', (row, [file, message]) => {
    const messages = lint(file, { ...options, files: { ...CORE_FILES, ...STAND_INS } });
    expect(messages.map((found) => found.message)).toContainEqual(expect.stringContaining(message));
  });

  it('fails the entry points and the opener on each import their rows leave out', () => {
    const withStandIns = { ...options, files: { ...CORE_FILES, ...STAND_INS } };
    expect(lint('index-must-fail.ts', withStandIns).map((found) => found.message)).toEqual([
      expect.stringContaining('reaches validation/validate from'),
      expect.stringContaining('reaches view/view from'),
    ]);
    expect(lint('resume-must-fail.ts', withStandIns).map((found) => found.message)).toEqual([
      expect.stringContaining('reaches view/view from'),
      expect.stringContaining('reaches ports/index from'),
    ]);
    expect(lint('open.ts').map((found) => found.message)).toEqual([
      expect.stringContaining('reaches interchange/emit from open/'),
      expect.stringContaining('reaches view/view from open/'),
    ]);
    expect(lint('interchange/must-fail.ts')).toHaveLength(2);
    expect(lint('ports/must-fail-imports.ts')).toHaveLength(1);
  });

  it('fails a root file with no row', () => {
    const messages = lint('unlisted.ts');
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('in no module of the §4.1 import table');
  });

  it('holds the rows 05-architecture.md §4.1 states', () => {
    expect(CORE_MODULES.kernel).toEqual([]);
    expect(CORE_MODULES.ports).toEqual(['kernel']);
    expect(CORE_TYPES_ONLY).toEqual(['ports']);
    expect(Object.entries(CORE_FILES).filter(([, allowed]) => allowed.includes('ports')).map(([file]) => file)).toEqual(['index']);
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

describe('no-answer-in-diagnostics (NFR-X-04, M4 plan D9)', () => {
  const dir = `${fixtures}/no-answer-in-diagnostics`;
  const typed = (file) => {
    const typedLinter = new Linter({ configType: 'flat', cwd: root });
    return typedLinter.verify(
      readFileSync(`${root}/${dir}/${file}`, 'utf8'),
      {
        files: ['**/*.ts'],
        plugins: { fhirq: fhirqPlugin },
        languageOptions: {
          parser: tsParser,
          ecmaVersion: 2022,
          sourceType: 'module',
          parserOptions: { project: `${root}/${dir}/tsconfig.json`, tsconfigRootDir: `${root}/${dir}` },
        },
        rules: { 'fhirq/no-answer-in-diagnostics': 'error' },
      },
      `${root}/${dir}/${file}`,
    );
  };

  it('fails the fixture that interpolates, concatenates, stringifies or logs an answer value (AC-9)', () => {
    const messages = typed('must-fail.ts');
    expect(messages.map((message) => [message.line, message.ruleId])).toEqual([
      [8, 'fhirq/no-answer-in-diagnostics'],
      [10, 'fhirq/no-answer-in-diagnostics'],
      [12, 'fhirq/no-answer-in-diagnostics'],
      [14, 'fhirq/no-answer-in-diagnostics'],
      [16, 'fhirq/no-answer-in-diagnostics'],
    ]);
    expect(messages[0].message).toContain('reaches a diagnostic');
    expect(messages[3].message).toContain('reaches an error');
    expect(messages[4].message).toContain('reaches the console');
  });

  it('passes kinds, counts and paths, which are what diagnostics name', () => {
    expect(typed('must-pass.ts')).toEqual([]);
  });

  it('says so when it has no type information, rather than passing silently', () => {
    const messages = lintFixture(`${dir}/must-pass.ts`, 'no-answer-in-diagnostics');
    expect(messages.map((message) => message.message)).toEqual([expect.stringContaining('needs type information')]);
  });
});

describe("ADR-0020's locale lint pair (NFR-M-06, NFR-I-04)", () => {
  const dir = `${fixtures}/locale`;
  const lintWith = (file, rules) =>
    linter.verify(
      readFileSync(`${root}/${dir}/${file}`, 'utf8'),
      { files: ['**/*.ts'], languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' }, rules },
      `${root}/${dir}/${file}`,
    );

  it('fails every ambient-locale read in core, and Intl outside view/format', () => {
    const messages = lintWith('must-fail.ts', { ...LOCALE_RULES.everywhere, ...LOCALE_RULES.outsideFormat });
    expect(messages.map((message) => [message.line, message.ruleId])).toEqual([
      [3, 'no-restricted-globals'],
      [5, 'no-restricted-properties'],
      [7, 'no-restricted-properties'],
      [9, 'no-restricted-properties'],
      [11, 'no-restricted-globals'],
      [11, 'no-restricted-properties'],
    ]);
  });

  it('holds the React adapter to the same reads, leaving it process.env for a development build (M6)', () => {
    expect(lintWith('must-fail.ts', LOCALE_RULES.renderer).map((message) => [message.line, message.ruleId])).toEqual([
      [3, 'no-restricted-globals'],
      [5, 'no-restricted-properties'],
      [9, 'no-restricted-properties'],
      [11, 'no-restricted-globals'],
      [11, 'no-restricted-properties'],
    ]);
  });

  it("holds the element to the renderer's rules, and to no read of the browser's language outside its locale file (M7)", () => {
    expect(lintWith('element-must-fail.ts', LOCALE_RULES.element).map((message) => [message.line, message.ruleId])).toEqual([
      [2, 'no-restricted-properties'],
      [3, 'no-restricted-properties'],
      [4, 'no-restricted-properties'],
      [5, 'no-restricted-properties'],
      [6, 'no-restricted-properties'],
      [7, 'no-restricted-properties'],
      [9, 'no-restricted-properties'],
      [10, 'no-restricted-globals'],
      [10, 'no-restricted-properties'],
    ]);
    // src/locale.ts may read navigator.language, and nothing more.
    expect(lintWith('element-must-fail.ts', LOCALE_RULES.renderer).map((message) => message.line)).toEqual([9, 10, 10]);
    expect(lintWith('must-fail.ts', LOCALE_RULES.element)).toEqual(lintWith('must-fail.ts', LOCALE_RULES.renderer));
  });

  it('lets view/format use Intl with the locale it is given, and still bans resolvedOptions there', () => {
    expect(lintWith('format.ts', LOCALE_RULES.everywhere)).toEqual([]);
    expect(lintWith('must-fail.ts', LOCALE_RULES.everywhere).map((message) => message.line)).toEqual([5, 7, 9, 11]);
  });
});
