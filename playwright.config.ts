import { defineConfig, devices } from '@playwright/test';

/** The React adapter's page-level gates (M6 AC-1, AC-3, plan D11), blocking in CI's React gates job. */
const REACT = ['hydration.spec.ts', 'quickstart.spec.ts', 'react-a11y.spec.ts'];
/**
 * The element's specs, in all three engines (M7 plan D8), blocking in CI's
 * Element gates job. The theme's moved to Accessibility gates at M8. The cross-renderer DOM contract is among them: it is the
 * element's half of ADR-0007, and markup, so it runs in Chromium only.
 */
const ELEMENT = [
  'caret.spec.ts',
  'contract.spec.ts',
  'csp.spec.ts',
  'element-a11y.spec.ts',
  'embed.spec.ts',
  'isolation.spec.ts',
  'reconnect.spec.ts',
  'resolver.spec.ts',
  'two-elements.spec.ts',
];
/** M8's axe matrix, Chromium only (plan D4), blocking in CI's Accessibility gates job. */
const MATRIX = 'a11y-matrix.spec.ts';
/** The theme's and accessibility's specs, RTL's (plan D5) and the pass pages' among them, in every engine, blocking in the same job (M8). */
const A11Y = ['pass-pages.spec.ts', 'print.spec.ts', 'rtl.spec.ts', 'themed-host.spec.ts', 'tokens.spec.ts', 'visual-a11y.spec.ts'];
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
 *   reconnection, two elements and axe specs, in every engine NFR-C-07 names
 *   (M7 plan D8,
 *   `pnpm test:browser:element`), and the DOM contract on
 *   the demo across both renderers (M7 plan step 4). Firefox is a browser
 *   binary Playwright installs, not a dependency. Blocking from M7 in CI's
 *   `Element gates` job.
 * - `a11y-matrix`: axe across forms, tiers, schemes, widths and both
 *   renderers, in Chromium (M8 plan D4); `a11y-chromium`, `a11y-firefox`,
 *   `a11y-webkit`: print, the tier-2 example, the token sentinel and the
 *   visual gates (contrast, focus, targets, reflow, motion), RTL and the
 *   screen-reader pass pages in every engine. Blocking from M8 in CI's `Accessibility gates` job (`pnpm
 *   test:browser:a11y`), which replaced M1's axe proof on the slice.
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
    { name: 'a11y-matrix', use: { ...devices['Desktop Chrome'] }, testMatch: MATRIX },
    { name: 'a11y-chromium', use: { ...devices['Desktop Chrome'] }, testMatch: A11Y },
    { name: 'a11y-firefox', use: { ...devices['Desktop Firefox'] }, testMatch: A11Y },
    { name: 'a11y-webkit', use: { ...devices['Desktop Safari'] }, testMatch: A11Y },
    { name: 'keystroke', use: { ...devices['Desktop Chrome'] }, testMatch: KEYSTROKE },
  ],
});
