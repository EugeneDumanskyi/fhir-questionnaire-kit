import { defineConfig, devices } from '@playwright/test';

/** The React adapter's page-level gates (M6 AC-1, AC-3, plan D11), blocking in CI's React gates job. */
const REACT = ['hydration.spec.ts', 'quickstart.spec.ts', 'react-a11y.spec.ts'];
/** Timings, report-only (M6 AC-10). */
const KEYSTROKE = 'keystroke.spec.ts';

/**
 * Browser specs. Pages are served in memory through `page.route`, so there is
 * no web server to start. The gate ladder (06-roadmap.md §5) decides what
 * blocks:
 *
 * - `react-chromium`, `react-webkit`: SSR hydration with 0 warnings on React
 *   18 and 19, the quickstart and axe on it and the demo. Blocking from M6
 *   (`pnpm test:browser:react`).
 * - `chromium`, `webkit`: S1's proofs, the DOM contract, axe on the slice,
 *   caret and CSP (M1 decision D5). Not a required check: CSP blocks from M7
 *   and accessibility from M8 (`pnpm test:browser:proofs`).
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [...REACT, KEYSTROKE] },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: [...REACT, KEYSTROKE] },
    { name: 'keystroke', use: { ...devices['Desktop Chrome'] }, testMatch: KEYSTROKE },
  ],
});
