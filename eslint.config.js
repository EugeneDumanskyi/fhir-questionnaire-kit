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
      // Deliberate violations, linted only by the rules' own tests.
      'tools/eslint-rules/test/fixtures/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Type-aware linting is deliberately not switched on at M0: it needs a
    // populated project graph to be worth its seconds in the fast lane
    // (NFR-M-07), and it arrives with the engine in M2.
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
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'No default exports: a named export is what the API report, the deep-import rule and a reader all read (NFR-M-04).',
        },
      ],
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
    rules: { 'fhirq/no-dom-in-core': 'error' },
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
      '**/test/**/*.{js,ts}',
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
