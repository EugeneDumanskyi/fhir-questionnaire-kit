import { defineConfig, devices } from '@playwright/test';

/**
 * S1 browser proofs (M1 AC-4 to AC-8). Not a required check: the gate ladder
 * makes SSR blocking in M6, CSP in M7 and accessibility in M8
 * (06-roadmap.md §5, decision D5). Pages are served in memory through
 * `page.route`, so there is no web server to start.
 */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: 0,
  reporter: process.env['CI'] !== undefined ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
