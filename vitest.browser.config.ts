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

/** A fresh object per project: Vitest names each instance in place. */
/** Pre-bundled up front, so a late discovery cannot load a second React mid-run. */
const REACT_DEPS = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-dom/server.browser'];

const chromium = () => ({ enabled: true, provider: 'playwright', headless: true, screenshotFailures: false, instances: [{ browser: 'chromium' as const }] });

/**
 * The React adapter's client tests, in Chromium (M6 plan D4): effects, event
 * handlers, StrictMode and hydration only run in a browser, and NFR-Q-02's
 * 85 / 80 is measured here with v8 coverage (`pnpm test:react`). Kept out of
 * `vitest.config.ts` so `pnpm test` stays Node-only with no DOM shim: the
 * engine's claim to run in Node (NFR-C-04) and the adapter's to render on a
 * server (AC-08.3.1) are tested where nothing fakes a DOM.
 *
 * Both majors run the same files (NFR-C-03). React 18 lives in its own
 * workspace package, so its project aliases `react` and `react-dom` there and
 * has Vite pre-bundle them, since they ship CommonJS.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/react/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage/react',
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
    ],
  },
});
