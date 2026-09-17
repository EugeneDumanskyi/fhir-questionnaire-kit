import js from '@eslint/js';
import tseslint from 'typescript-eslint';

import { fhirqPlugin } from './tools/eslint-rules/src/index.js';

/** The published entry points. `no-deep-imports` allows these and nothing else. */
const ENTRY_POINTS = {
  '@fhirq/core': ['@fhirq/core', '@fhirq/core/view'],
  '@fhirq/react': ['@fhirq/react'],
  '@fhirq/element': ['@fhirq/element'],
  '@fhirq/themes': ['@fhirq/themes', '@fhirq/themes/base.css', '@fhirq/themes/default.css'],
};

/**
 * ADR-0012's single exception. It does not exist yet — the element is M7 — and
 * it is listed here now so that the rule has to be edited, visibly, if a second
 * file ever wants the network.
 */
const NETWORK_ALLOWED = ['packages/element/src/default-resolver.ts'];

const NO_DEFAULT_EXPORT = {
  selector: 'ExportDefaultDeclaration',
  message:
    'No default exports: a named export is what the API report, the deep-import rule and a reader all read (NFR-M-04).',
};

/**
 * ADR-0014: the element styles itself only through adopted constructable
 * stylesheets. A `<style>` element or a `style` attribute is blocked by a
 * strict CSP (NFR-C-07), and an `el.style` write is an inline style by another
 * route. `packages/element/test/style-bans.test.ts` holds a must-fail case for
 * each selector.
 */
const STYLE_MESSAGE =
  'The element styles only through adopted stylesheets (ADR-0014): no <style> element, no style attribute, no .style write.';
const NO_INLINE_STYLE = [
  "CallExpression[callee.property.name='createElement'][arguments.0.value=/^style$/i]",
  "CallExpression[callee.property.name=/^(setAttribute|setAttributeNS|toggleAttribute)$/][arguments.0.value=/^style$/i]",
  "CallExpression[callee.property.name='setAttributeNS'][arguments.1.value=/^style$/i]",
  "AssignmentExpression > MemberExpression.left[property.name='style']",
  "AssignmentExpression > MemberExpression.left[object.property.name='style']",
  "CallExpression[callee.object.property.name='style']",
  "MemberExpression[property.name='attributeStyleMap']",
].map((selector) => ({ selector, message: STYLE_MESSAGE }));

/**
 * `05-architecture.md` §4.1, row by row (NFR-M-06). A module may import its own
 * files and the entries listed; `fhir/r4/parse` and `session/projection` are
 * single files, `index` is the public engine API. `interchange/` and `ports/`
 * do not exist yet and are listed so their rows hold from their first file.
 * `session/snapshot` is interchange's second door into session state (M3).
 */
export const CORE_MODULES = {
  kernel: [],
  'fhir/r4': ['kernel'],
  definition: ['kernel', 'fhir/r4/parse'],
  session: ['kernel', 'definition'],
  validation: ['kernel', 'definition', 'session/projection'],
  interchange: ['kernel', 'definition', 'session/projection', 'session/snapshot', 'fhir/r4'],
  ports: ['kernel'],
  view: ['kernel', 'index'],
};

/** Where prose is allowed to live (NFR-I-01). The catalogue itself is M4. */
const CATALOGUE = ['packages/core/src/**/messages/**'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      '.tsbuild/**',
      '.stryker-tmp/**',
      // Deliberate violations, linted only by the rules' own tests.
      'tools/eslint-rules/test/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Type-aware rules, switched on with the engine in M2 (step 12): about six
    // seconds more in the fast lane, well inside NFR-M-07's 3 minutes. They need
    // the project graph, so they cover the TypeScript the tsconfig projects
    // include, plus the root config files through the default project. The
    // playground is an app with its own dependencies and joins in M9.
    files: ['packages/**/*.{ts,tsx}', 'tests/**/*.ts', '*.config.ts'],
    // Lint tests lint virtual files that no project includes.
    ignores: ['**/__lint-fixture__.ts'],
    extends: [tseslint.configs.recommendedTypeCheckedOnly],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { fhirq: fhirqPlugin },
    rules: {
      /* The repository's hard rules, made mechanical. */
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-syntax': ['error', NO_DEFAULT_EXPORT],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      /* NFR-M-02. A function above 15 needs an inline justification, written as
         an eslint-disable-next-line comment naming why, which review reads. */
      complexity: ['error', 15],

      /* NFR-M-06. */
      'fhirq/no-network': ['error', { allow: NETWORK_ALLOWED }],
      'fhirq/no-deep-imports': ['error', { entryPoints: ENTRY_POINTS }],
    },
  },

  {
    /* ADR-0007: the engine and the presentation model are DOM-free. */
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'fhirq/no-dom-in-core': 'error',
      'fhirq/core-module-imports': ['error', { root: 'packages/core/src', modules: CORE_MODULES }],
      /* ADR-0016: R4 shapes stay in the codec. */
      'fhirq/no-fhir-shapes-outside-codec': ['error', { allow: ['packages/core/src/fhir/**'] }],
    },
  },

  {
    files: ['packages/element/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', NO_DEFAULT_EXPORT, ...NO_INLINE_STYLE] },
  },

  {
    /* NFR-I-01 covers the library's own surface. The playground is an app and
       speaks for itself; it is not translated by a host. */
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: { 'fhirq/no-hardcoded-user-strings': ['error', { catalogue: CATALOGUE }] },
  },

  {
    /* Tooling, configuration and tests run in Node. Listed by hand rather than
       through the `globals` package: five names are not worth a dependency, and
       a short list is one a reader can check against what the code uses. */
    files: [
      '**/*.config.{js,ts}',
      'eslint.config.js',
      'tools/**/*.js',
      '**/test/**/*.{js,ts,tsx}',
      'tests/**/*.ts',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        globalThis: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: {
      'fhirq/no-deep-imports': 'off',
    },
  },

  {
    /* A config file's contract with its tool is a default export. The ban is
       about the kit's own API surface, which none of these are. */
    files: ['**/*.config.{js,ts}', 'eslint.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
