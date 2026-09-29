import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { DOCS, docsPages, serveDocs } from './pages/playground.js';
import { ORIGIN } from './pages/serve.js';

/**
 * The docs site under ADR-0019's policy (M10 plan step 4, D10), in Chromium,
 * Firefox and WebKit: on every built page the policy is the first element of
 * `<head>`, the page holds no script, no `<style>` and no `style` attribute,
 * loads only its own stylesheet and images from the site, breaks nothing in
 * the policy, and reflows at 320 CSS pixels with no page-wide horizontal
 * scroll (WCAG 1.4.10): wide tables and code scroll in their own box. Run
 * `pnpm build:docs` first.
 */

const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

const pages = docsPages();

/** Counts every policy violation from before the page parses. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { fhirqViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective} ${event.blockedURI}`), true);
  });
  return () => page.evaluate(() => (window as unknown as { fhirqViolations: string[] }).fhirqViolations);
}

test('the docs are built', () => {
  expect(pages, 'run `pnpm build:docs` first').toContain('index.html');
  expect(pages).toContain('conformance.html');
});

for (const path of pages) {
  test(`${path}: the policy first, nothing inline, only the site's own files, no violation, reflows`, async ({ page }) => {
    await page.route((url) => !url.href.startsWith(`${ORIGIN}/`), (route) => route.abort());
    const served = await serveDocs(page);
    const violations = await watchViolations(page);
    await page.goto(`${DOCS}${path}`);

    const first = page.locator('head > :first-child');
    await expect(first).toHaveAttribute('http-equiv', 'Content-Security-Policy');
    await expect(first).toHaveAttribute('content', POLICY);
    await expect(page.locator('script, style, [style]')).toHaveCount(0);
    // The one stylesheet applied: the header is a flex row.
    await expect(page.locator('body > header')).toHaveCSS('display', 'flex');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    expect(served.requests.filter((request) => request.status !== 200 || request.method !== 'GET')).toEqual([]);
    expect(await violations()).toEqual([]);

    await page.setViewportSize({ width: 320, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test("has an anchor for every row the playground's diagnostics link to (M9 plan D5)", async ({ page }) => {
  await serveDocs(page);
  const matrix = JSON.parse(readFileSync(new URL('../../docs/conformance/matrix.json', import.meta.url), 'utf8')) as {
    readonly rows: readonly { readonly id: string; readonly diagnostics?: readonly string[] }[];
  };
  const linked = matrix.rows.filter((row) => row.diagnostics !== undefined).map((row) => row.id);
  expect(linked).toContain('item-type.attachment');
  await page.goto(`${DOCS}conformance.html#item-type.attachment`);
  for (const id of linked) await expect(page.locator(`tr[id="${id}"]`), id).toHaveCount(1);
  await expect(page.locator('tr:target')).toContainText('Outside the supported item types');
});
