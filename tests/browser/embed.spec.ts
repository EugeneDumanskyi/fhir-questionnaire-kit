import { readFileSync } from 'node:fs';

import { expect, test, type Request } from '@playwright/test';

import { EMBED, ORIGIN, serve } from './pages/serve.js';

/**
 * M7 AC-1, AC-09.1.1: `examples/element-embed` as an embedder writes it, a
 * plain page with one script tag and one element naming its form by `src`,
 * served as it is on disk with the script-tag build beside it. No bundler,
 * transpiler or framework, and no script of the page's own. It renders,
 * takes answers and shows a conditional question, under the page's strict
 * CSP. Axe runs over it in `element-a11y.spec.ts`. Chromium, Firefox and
 * WebKit.
 */

const at = (path: string) => new URL(`../../${path}`, import.meta.url);

test('the example names the demonstration form, unchanged', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Files on disk; one engine suffices.');
  const json = (path: string): unknown => JSON.parse(readFileSync(at(path), 'utf8'));
  expect(json('examples/element-embed/demo.json')).toEqual(json('fixtures/demo/questionnaire.json'));
});

test('the page is one script tag and one element, with no script of its own', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Files on disk; one engine suffices.');
  const page = readFileSync(at('examples/element-embed/index.html'), 'utf8');
  expect(page.match(/<script\b[^>]*>/g)).toEqual(['<script src="fhirq-element.js">']);
  expect(page.match(/<fhir-questionnaire\b[^>]*>/g)).toEqual(['<fhir-questionnaire src="demo.json">']);
  expect(page).not.toMatch(/<style\b|\sstyle=|<link\b|\son[a-z]+=/i);
});

test('one script tag renders a working form: it takes answers and shows a conditional question', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request: Request) => requests.push(new URL(request.url()).pathname));
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const violations: string[] = [];
  await page.exposeFunction('fhirqViolation', (directive: string) => violations.push(directive));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => void (window as unknown as { fhirqViolation(d: string): void }).fhirqViolation(event.violatedDirective), true);
  });

  await serve(page);
  await page.goto(`${ORIGIN}${EMBED}`);

  const pain = page.getByRole('radiogroup', { name: 'Are you in pain today?' });
  const score = page.getByRole('textbox', { name: /how strong is it\?$/ });
  await expect(pain).toBeVisible();
  await expect(score).toHaveCount(0);

  await pain.getByRole('radio', { name: 'Yes' }).check();
  await expect(score).toBeVisible();
  await score.fill('7');
  await expect(score).toHaveValue('7');
  await expect(score).toBeFocused();

  const answer = page.getByRole('textbox', { name: 'What is the main reason for your visit?' });
  await answer.fill('A sore knee');
  await expect(answer).toHaveValue('A sore knee');

  await pain.getByRole('radio', { name: 'No' }).check();
  await expect(score).toHaveCount(0);
  await pain.getByRole('radio', { name: 'Yes' }).check();
  // The answer is kept while its question is hidden (answer retention).
  await expect(score).toHaveValue('7');

  expect(await page.evaluate(() => typeof customElements.get('fhir-questionnaire'))).toBe('function');
  expect(requests).toEqual([EMBED, `${EMBED}fhirq-element.js`, `${EMBED}demo.json`]);
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});
