import { defineConfig, devices } from '@playwright/test';

/** The React adapter's page-level gates (M6 AC-1, AC-3, plan D11), blocking in CI's React gates job. */
const REACT = ['hydration.spec.ts', 'quickstart.spec.ts', 'react-a11y.spec.ts'];
/** The element's specs, in all three engines (M7 plan D8); blocking from M7's step 11. */
const ELEMENT = [
  'caret.spec.ts',
  'csp.spec.ts',
  'element-a11y.spec.ts',
  'embed.spec.ts',
  'isolation.spec.ts',
  'reconnect.spec.ts',
  'resolver.spec.ts',
  'two-elements.spec.ts',
];
/** Timings, report-only (M6 AC-10, M7 AC-5). */
const KEYSTROKE = 'keystroke.spec.ts';

/**
 * Browser specs. Pages are served in memory through `page.route`, so there is
 * no web server to start. The gate ladder (06-roadmap.md §5) decides what
 * blocks:
 *
 * - `react-chromium`, `react-webkit`: SSR hydration with 0 warnings on React
 *   18 and 19, the quickstart and axe on it and the demo. Blocking from M6
 *   (`pnpm test:browser:react`).
 * - `element-chromium`, `element-firefox`, `element-webkit`: the element's
 *   caret, CSP, resolver, script-tag embed, isolation, tokens and parts,
 *   reconnection, two elements, and axe specs, in every engine NFR-C-07
 *   names (M7 plan D8, `pnpm test:browser:element`). Firefox is a browser
 *   binary Playwright installs, not a dependency. Not yet a required check:
 *   M7's `Element gates` job.
 * - `chromium`, `firefox`, `webkit`: S1's proofs, the DOM contract on the
 *   demo (M7 plan step 4), and axe on the slice (M1 decision D5). Not a
 *   required check: accessibility blocks from M8 (`pnpm
 *   test:browser:proofs`).
 * - `keystroke`: run by `pnpm test:keystroke` on one worker, since a proof
 *   running beside it would be in the reading.
 *
 * `pnpm test:browser` runs all but the timings.
 */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  reporter: process.env['CI'] !== undefined ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'react-chromium', use: { ...devices['Desktop Chrome'] }, testMatch: REACT },
    { name: 'react-webkit', use: { ...devices['Desktop Safari'] }, testMatch: REACT },
    { name: 'element-chromium', use: { ...devices['Desktop Chrome'] }, testMatch: ELEMENT },
    { name: 'element-firefox', use: { ...devices['Desktop Firefox'] }, testMatch: ELEMENT },
    { name: 'element-webkit', use: { ...devices['Desktop Safari'] }, testMatch: ELEMENT },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [...REACT, ...ELEMENT, KEYSTROKE] },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: [...REACT, ...ELEMENT, KEYSTROKE] },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: [...REACT, ...ELEMENT, KEYSTROKE] },
    { name: 'keystroke', use: { ...devices['Desktop Chrome'] }, testMatch: KEYSTROKE },
  ],
});
