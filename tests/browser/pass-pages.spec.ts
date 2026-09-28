import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { audit } from './axe.js';
import { ORIGIN } from './pages/serve.js';

/**
 * The pages the manual screen-reader passes run on (`scripts/a11y-pages.mjs`,
 * NFR-A-02): written by the script as a tester writes them, served from disk
 * as a static server serves them, in every engine. Each loads under its own
 * CSP with nothing on the console, has 0 axe violations with its host chrome,
 * and its submit button refuses an unanswered form and moves focus to the
 * error summary, the path the script's steps walk.
 */

const PAGES = ['element-demo.html', 'element-kinds.html', 'react-demo.html', 'react-kinds.html'];
const TYPES: Readonly<Record<string, string>> = { css: 'text/css', html: 'text/html', js: 'text/javascript' };

let out = '';
test.beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'fhirq-pass-'));
  const script = fileURLToPath(new URL('../../scripts/a11y-pages.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, '--out', out], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
});

/** Serves `out` at the test origin, a directory as its index; collects anything the page writes to the console. */
async function serveOut(page: Page): Promise<string[]> {
  const logged: string[] = [];
  page.on('console', (message) => logged.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => logged.push(`error: ${error.message}`));
  await page.route(`${ORIGIN}/**`, async (route) => {
    const file = new URL(route.request().url()).pathname.replace(/\/$/, '/index.html').slice(1);
    try {
      await route.fulfill({ status: 200, contentType: TYPES[file.split('.').pop() ?? ''] ?? 'text/plain', body: readFileSync(join(out, file)) });
    } catch {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  return logged;
}

test('the index links every page', async ({ page }) => {
  await serveOut(page);
  await page.goto(`${ORIGIN}/`);
  const links = page.getByRole('main').getByRole('link');
  await expect(links).toHaveCount(PAGES.length);
  expect(await links.evaluateAll((found) => found.map((link) => link.getAttribute('href')))).toEqual(PAGES);
});

for (const file of PAGES)
  test(`${file}: loads clean, 0 axe violations, and Submit refuses to the summary`, async ({ page }) => {
    const logged = await serveOut(page);
    await page.goto(`${ORIGIN}/${file}`);
    const form = page.locator('.fhirq-form');
    await expect(form).toBeVisible();
    expect(await audit(page)).toEqual([]);

    await page.getByRole('button', { name: 'Submit' }).click();
    const summary = page.getByRole('region', { name: 'There is a problem' });
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link').first()).toBeVisible();
    expect(await audit(page)).toEqual([]);
    expect(logged).toEqual([]);
  });
