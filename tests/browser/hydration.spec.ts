import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { CLIENT_ZONE, open, ORIGIN, reach, rendered } from './pages/serve.js';

/**
 * AC-08.3.1/2 and NFR-C-08 at full breadth (M6 AC-3, plan step 8): every
 * React page is rendered on a server in one timezone and hydrated in a
 * browser in another (ADR-0020), on React 18 and 19, in development builds
 * (the ones that print hydration warnings), under StrictMode. Hydration must
 * print nothing and adopt the server markup rather than replace it, and the
 * page must load nothing but itself (AC-14.6.1 for the stylesheets).
 */

test.use({ timezoneId: CLIENT_ZONE });

/** The same instant in both zones: UTC+14 on the server, UTC−12 here. */
const MAY_DAY = Date.UTC(2024, 4, 1);

/** Every console warning or error, every page error, and every request the page makes. */
async function watch(page: Page) {
  const messages: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  page.on('request', (request) => requests.push(request.url()));
  // A client re-render after a mismatch replaces the server nodes; count removals.
  await page.addInitScript(() => {
    const removed: string[] = [];
    Object.assign(window, { fhirqRemoved: removed });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (node instanceof Element && node.classList.contains('fhirq-form')) removed.push('fhirq-form');
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return async (major: 18 | 19, html: string) => {
    expect(messages).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { fhirqRemoved: string[] }).fhirqRemoved)).toEqual([]);
    expect(requests.map((url) => url.replace(ORIGIN, '')).sort()).toEqual(['/base.css', '/default.css', html, `/react-${major}.js`].sort());
  };
}

const fhirq = (page: Page) => page.evaluate(() => {
  const { calls, react } = (window as unknown as TestWindow).fhirq;
  return { calls: [...(calls ?? [])].sort(), react };
});

for (const major of [18, 19] as const) {
  test.describe(`React ${major}`, () => {
    test('hydrates the slice with 0 warnings, and it answers', async ({ page }) => {
      const check = await watch(page);

      await open(page, `react-${major}`);
      expect((await fhirq(page)).react?.split('.')[0]).toBe(String(major));
      expect(await page.evaluate((at) => new Date(at).getTimezoneOffset(), MAY_DAY)).toBe(720);
      expect((await rendered(major)).offset).toBe(-840);

      await reach(page, 'errors-surfaced');
      await page.getByRole('textbox').fill('10');
      await expect(page.getByRole('region', { name: 'There is a problem' })).toHaveCount(0);

      await check(major, `/react-${major}.html`);
    });

    test('hydrates the demo with 0 warnings, and it answers', async ({ page }) => {
      const check = await watch(page);

      await open(page, `react-${major}`, 'demo');
      await page.locator('[data-path="pain/pain-now"]').getByRole('radio', { name: 'Yes' }).check();
      await expect(page.locator('[data-path="pain/pain-score"]')).toHaveCount(1);

      await check(major, `/react-${major}-demo.html`);
    });

    test('hydrates value-set options pending as the server rendered them, then resolves them', async ({ page }) => {
      const check = await watch(page);
      const pending = (await rendered(major)).pages['value-set'].match(/<p class="fhirq-options-status"[^>]*>([^<]+)<\/p>/)?.[1];
      expect(pending).toBeTruthy();

      await open(page, `react-${major}`, 'value-set');
      await expect(page.locator('.fhirq-options-status')).toHaveText(pending ?? '');
      expect((await fhirq(page)).calls).toEqual(['urn:fhirq:conformance:ValueSet/route', 'urn:fhirq:conformance:ValueSet/substance']);

      await page.evaluate(() => (window as unknown as TestWindow).fhirq.release?.());
      await expect(page.locator('.fhirq-options-status')).toHaveCount(0);
      await expect(page.getByRole('radio', { name: 'route A' })).toHaveCount(1);
      expect((await fhirq(page)).calls).toHaveLength(2);

      await check(major, `/react-${major}-value-set.html`);
    });

    test('hydrates dates, decimals and quantities as the server worded them (ADR-0020)', async ({ page, browserName }) => {
      const check = await watch(page);
      const server = (await rendered(major)).pages.formats;
      const texts = (pattern: RegExp) => [...server.matchAll(pattern)].map(([, text]) => text ?? '');
      const shown = texts(/<output[^>]*>([^<]*)<\/output>/g);
      const issue = texts(/<p class="fhirq-error-message"[^>]*>([^<]*)<\/p>/g);
      const entry = texts(/<a class="fhirq-summary-link"[^>]*>([^<]*)<\/a>/g);
      expect(shown).toEqual(['May 1, 2024', 'May 2024', '2024', 'May 1, 2024, 11:30 PM', '1,234.5', '1.5 mg']);
      expect(issue).toEqual(['Enter Apr 30, 2024, 12:00 AM or less. You entered May 1, 2024, 12:30 AM.']);
      expect(entry).toEqual([`Seen: ${issue[0] ?? ''}`]);

      await open(page, `react-${major}`, 'formats');
      await expect(page.locator('[data-path="born"] input')).toHaveValue('2024-05-01');
      // React 19 keeps the server's wording; React 18 puts in the browser's own, silently. Node's ICU data and Chromium's agree, so there both read as the server's.
      if (major === 19 || browserName === 'chromium') {
        await expect(page.locator('output')).toHaveText(shown);
        await expect(page.locator('.fhirq-error-message')).toHaveText(issue);
        await expect(page.locator('.fhirq-summary-link')).toHaveText(entry);
      }
      await check(major, `/react-${major}-formats.html`);

      // The server's wording stays only until the node changes: then it is this browser's own.
      const own = await page.evaluate(() => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(Date.UTC(2024, 3, 30)));
      await page.locator('[data-path="seen"] input').fill('2024-05-02T00:30:00+14:00');
      await expect(page.locator('[data-path="seen"] .fhirq-error-message')).toContainText(`Enter ${own} or less.`);
      test.info().annotations.push({ type: 'engine wording', description: `${browserName}: ${own}` });
    });
  });
}

