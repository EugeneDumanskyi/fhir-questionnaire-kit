import { expect, test } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * The playground's build (M9 step 2; ADR-0019 and its 2026-09-28 note): it
 * loads from `dist` under Pages' project path through relative asset paths,
 * and carries the strict CSP as the first element of `<head>`. The privacy
 * test proper, a network log across paste, answers and tiers, is step 10's.
 */

const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

test('loads every asset from the build under the project path', async ({ page }) => {
  const served = await servePlayground(page);
  await page.goto(PLAYGROUND);
  await page.waitForLoadState('networkidle');
  expect(served.requests.length).toBeGreaterThan(1);
  expect(served.requests.filter((request) => request.status !== 200)).toEqual([]);
  expect(served.requests.every((request) => request.method === 'GET' && request.url.startsWith(PLAYGROUND))).toBe(true);
  await expect(page.locator('#root > main')).toBeAttached();
});

test('carries the policy as the first element of <head>, and the page breaks none of it', async ({ page }) => {
  await servePlayground(page);
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { fhirqViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.violatedDirective), true);
  });
  await page.goto(PLAYGROUND);
  await page.waitForLoadState('networkidle');
  const first = page.locator('head > :first-child');
  await expect(first).toHaveAttribute('http-equiv', 'Content-Security-Policy');
  await expect(first).toHaveAttribute('content', POLICY);
  expect(await page.evaluate(() => (window as unknown as { fhirqViolations: string[] }).fhirqViolations)).toEqual([]);
});

test('the policy is enforced: the browser refuses a connection', async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
  const refused = await page.evaluate(async () => {
    try {
      // eslint-disable-next-line fhirq/no-network -- the connection the policy must refuse
      await fetch('./index.html');
      return false;
    } catch {
      return true;
    }
  });
  expect(refused).toBe(true);
});
