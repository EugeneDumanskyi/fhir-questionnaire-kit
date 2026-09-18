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
];

/**
 * One Vitest run over the workspace. Every project here is `environment: node`
 * with no DOM shim, on purpose: NFR-C-04 says the engine runs in Node, and a
 * jsdom default is how that claim quietly stops being tested. Renderers are
 * exercised in real browsers by Playwright (`pnpm test:browser`), not here.
 */
export default defineConfig({
  test: {
    /**
     * `pnpm test:coverage`. Core is gated at 95 % line / 90 % branch from M2
     * (NFR-Q-01), measured by its own Node suite alone (`pnpm
     * test:coverage:core`, the engine-gates job), so another package's tests
     * cannot lift it. Adapters follow at 85 / 80 in M6 and M7 (NFR-Q-02); the
     * renderers are proven in browsers, so their Node coverage understates them.
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
          env: { FHIRQ_REACT_MAJOR: '19' },
        },
      },
      {
        // The same suite on React 18 (NFR-C-03). React 18 lives in its own
        // workspace package so the two majors never share a node_modules.
        resolve: {
          alias: [
            ...workspaceSources,
            { find: /^react-dom(\/.*)?$/, replacement: here('./tools/react-18/node_modules/react-dom$1') },
            { find: /^react(\/.*)?$/, replacement: here('./tools/react-18/node_modules/react$1') },
          ],
        },
        test: {
          name: 'react-18',
          root: './packages/react',
          environment: 'node',
          include: ['test/**/*.test.{ts,tsx}'],
          env: { FHIRQ_REACT_MAJOR: '18' },
        },
      },
      {
        test: {
          name: 'element',
          root: './packages/element',
          environment: 'node',
          include: ['test/**/*.test.ts'],
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
