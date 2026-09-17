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
  { find: /^@fhirq\/react$/, replacement: here('./packages/react/src/index.ts') },
];

/**
 * One Vitest run over the workspace. Every project here is `environment: node`
 * with no DOM shim, on purpose: NFR-C-04 says the engine runs in Node, and a
 * jsdom default is how that claim quietly stops being tested. The renderers get
 * their own browser-backed projects when they have something to render (M6, M7).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['test/**/*.test.ts'],
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
          name: 'eslint-rules',
          root: './tools/eslint-rules',
          environment: 'node',
          include: ['test/**/*.test.js'],
        },
      },
    ],
  },
});
