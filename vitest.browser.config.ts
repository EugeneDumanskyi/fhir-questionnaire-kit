import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The same front doors as `vitest.config.ts`: tests import published specifiers, pointed at sources. */
const workspaceSources = [
  { find: /^@fhirq\/core$/, replacement: here('./packages/core/src/index.ts') },
  { find: /^@fhirq\/core\/view$/, replacement: here('./packages/core/src/view/index.ts') },
  { find: /^@fhirq\/core\/resume$/, replacement: here('./packages/core/src/resume.ts') },
  { find: /^@fhirq\/react$/, replacement: here('./packages/react/src/index.ts') },
];

/**
 * The element's own front door, and the theme it embeds. The element imports
 * each stylesheet as text: the build's esbuild text loader gives it minified,
 * and Vite's `?raw` gives the source as written.
 */
const elementSources = [
  ...workspaceSources,
  { find: /^@fhirq\/element$/, replacement: here('./packages/element/src/index.ts') },
  { find: /^@fhirq\/themes\/(base|default)\.css$/, replacement: `${here('./packages/themes/src/')}$1.css?raw` },
];

/** Pre-bundled up front, so a late discovery cannot load a second React mid-run. */
const REACT_DEPS = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-dom/server.browser'];

/** A fresh object per project: Vitest names each instance in place. */
const chromium = () => ({ enabled: true, provider: 'playwright', headless: true, screenshotFailures: false, instances: [{ browser: 'chromium' as const }] });

/**
 * The React adapter's client tests, in Chromium (M6 plan D4): effects, event
 * handlers, StrictMode and hydration only run in a browser, and NFR-Q-02's
 * 85 / 80 is measured here with v8 coverage (`pnpm test:coverage:react`). Kept out of
 * `vitest.config.ts` so `pnpm test` stays Node-only with no DOM shim: the
 * engine's claim to run in Node (NFR-C-04) and the adapter's to render on a
 * server (AC-08.3.1) are tested where nothing fakes a DOM.
 *
 * Both majors run the same files (NFR-C-03). React 18 lives in its own
 * workspace package, so its project aliases `react` and `react-dom` there and
 * has Vite pre-bundle them, since they ship CommonJS.
 *
 * The element's client tests run here too, in Chromium, and its NFR-Q-02
 * coverage is read from them (M7 plan D8, `pnpm test:coverage:element`, which
 * points coverage at the element's sources). The `test:react` and
 * `test:element` scripts each name their own projects.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/react/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage/react',
      // NFR-Q-02: React's from M6 in CI's React gates job, both majors' runs together;
      // the element's from M7 in its Element gates job (`test:coverage:element`).
      thresholds: { lines: 85, branches: 80 },
    },
    projects: [
      {
        resolve: { alias: workspaceSources },
        optimizeDeps: { include: REACT_DEPS },
        test: {
          name: 'react-browser',
          root: './packages/react',
          include: ['test/browser/**/*.test.{ts,tsx}'],
          env: { FHIRQ_REACT_MAJOR: '19' },
          browser: chromium(),
        },
      },
      {
        resolve: {
          alias: [
            ...workspaceSources,
            { find: /^react-dom(\/.*)?$/, replacement: here('./tools/react-18/node_modules/react-dom$1') },
            { find: /^react(\/.*)?$/, replacement: here('./tools/react-18/node_modules/react$1') },
          ],
        },
        optimizeDeps: { include: REACT_DEPS },
        test: {
          name: 'react-18-browser',
          root: './packages/react',
          include: ['test/browser/**/*.test.{ts,tsx}'],
          env: { FHIRQ_REACT_MAJOR: '18' },
          browser: chromium(),
        },
      },
      {
        resolve: { alias: elementSources },
        test: {
          name: 'element-browser',
          root: './packages/element',
          include: ['test/browser/**/*.test.ts'],
          browser: chromium(),
        },
      },
    ],
  },
});
