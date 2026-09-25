import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The published entry points resolve to `dist/`, which M1 does not build
 * (`pnpm build` is M11). Tests import the same specifiers and are pointed at
 * the sources here, so no test reaches past a front door.
 */
const workspaceSources = [
  { find: /^@fhirq\/core$/, replacement: here('./packages/core/src/index.ts') },
  { find: /^@fhirq\/core\/view$/, replacement: here('./packages/core/src/view/index.ts') },
  { find: /^@fhirq\/core\/resume$/, replacement: here('./packages/core/src/resume.ts') },
  { find: /^@fhirq\/react$/, replacement: here('./packages/react/src/index.ts') },
  { find: /^@fhirq\/themes\/(base|default)\.css$/, replacement: here('./packages/themes/src/$1.css') },
];

/** React 18 in place of 19, from its own workspace package, for a project's second-major run (NFR-C-03). */
const react18 = [
  { find: /^react-dom(\/.*)?$/, replacement: here('./tools/react-18/node_modules/react-dom$1') },
  { find: /^react(\/.*)?$/, replacement: here('./tools/react-18/node_modules/react$1') },
];

/**
 * One Vitest run over the workspace. Every project here is `environment: node`
 * with no DOM shim, on purpose: NFR-C-04 says the engine runs in Node, and a
 * jsdom default is how that claim quietly stops being tested. Renderers are
 * exercised in real browsers: page-level proofs by Playwright (`pnpm
 * test:browser`), the React adapter's client tests by Vitest in Chromium
 * (`vitest.browser.config.ts`, `pnpm test:react`), not here.
 */
export default defineConfig({
  test: {
    /**
     * `pnpm test:coverage`. Core is gated at 95 % line / 90 % branch from M2
     * (NFR-Q-01), measured by its own Node suite alone (`pnpm
     * test:coverage:core`, the engine-gates job), so another package's tests
     * cannot lift it. Adapters are held at 85 / 80 (NFR-Q-02) where they are
     * proven, in browsers: React from M6 by `vitest.browser.config.ts`, the
     * element from M7. Their Node coverage here understates them.
     */
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        'packages/core/src/**': { lines: 95, branches: 90 },
      },
    },
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          benchmark: { include: ['bench/**/*.bench.ts'] },
        },
      },
      {
        resolve: { alias: workspaceSources },
        test: {
          name: 'react',
          root: './packages/react',
          environment: 'node',
          include: ['test/**/*.test.{ts,tsx}'],
          exclude: ['test/browser/**'],
          env: { FHIRQ_REACT_MAJOR: '19' },
        },
      },
      {
        // The same suite on React 18 (NFR-C-03). React 18 lives in its own
        // workspace package so the two majors never share a node_modules.
        resolve: { alias: [...workspaceSources, ...react18] },
        test: {
          name: 'react-18',
          root: './packages/react',
          environment: 'node',
          include: ['test/**/*.test.{ts,tsx}'],
          exclude: ['test/browser/**'],
          env: { FHIRQ_REACT_MAJOR: '18' },
        },
      },
      {
        // M6 AC-1: the quickstart as a consumer writes it, rendered in Node on both majors.
        resolve: { alias: workspaceSources },
        test: {
          name: 'quickstart',
          root: './examples/react-quickstart',
          environment: 'node',
          include: ['test/**/*.test.tsx'],
          env: { FHIRQ_REACT_MAJOR: '19' },
        },
      },
      {
        resolve: { alias: [...workspaceSources, ...react18] },
        test: {
          name: 'quickstart-18',
          root: './examples/react-quickstart',
          environment: 'node',
          include: ['test/**/*.test.tsx'],
          env: { FHIRQ_REACT_MAJOR: '18' },
        },
      },
      {
        test: {
          name: 'element',
          root: './packages/element',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/browser/**'],
        },
      },
      {
        test: {
          name: 'themes',
          root: './packages/themes',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'scripts',
          root: './scripts',
          environment: 'node',
          include: ['test/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'eslint-rules',
          root: './tools/eslint-rules',
          environment: 'node',
          include: ['test/**/*.test.js'],
        },
      },
    ],
  },
});
