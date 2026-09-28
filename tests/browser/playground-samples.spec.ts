import { expect, test, type Page } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * The samples picker and the in-memory resolver (M9 plan D9): a sample puts a
 * fixture in the editor; its value sets resolve from the page, and one the
 * page does not hold fails, with the kit's retry.
 */

const editor = (page: Page) => page.getByRole('region', { name: 'Paste your own Questionnaire', exact: true });
const sample = (page: Page) => editor(page).getByLabel('Sample');
const text = (page: Page) => editor(page).getByLabel('Questionnaire JSON');
const outcome = (page: Page) => editor(page).getByRole('status');
const form = (page: Page) => page.getByRole('region', { name: 'Demonstration form', exact: true });

test.beforeEach(async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
});

test('opens on the demo sample, and loads option-resolution with its value sets resolved', async ({ page }) => {
  await expect(sample(page)).toHaveValue('0');
  await sample(page).selectOption({ label: 'Value sets (option-resolution)' });
  await expect(text(page)).toHaveValue(/urn:fhirq:conformance:option-resolution/);
  await expect(outcome(page)).toContainText('Loaded, with no diagnostics.');
  const route = form(page).getByRole('radiogroup', { name: 'How do you take it?' });
  await expect(route.getByRole('radio')).toHaveCount(2);
  await route.getByRole('radio', { name: 'B' }).check();
  await expect(route.getByRole('radio', { name: 'B' })).toBeChecked();
  // Back to the demo, and the picker says which text is in the editor.
  await sample(page).selectOption({ label: 'The demo' });
  await expect(form(page).getByRole('radiogroup', { name: 'Are you in pain today?' })).toBeVisible();
});

test('fails a value set the page does not hold, with the retry, and names it among the diagnostics', async ({ page }) => {
  await sample(page).selectOption({ label: 'Value sets (option-resolution)' });
  await expect(outcome(page)).toContainText('Loaded');
  const edited = (await text(page).inputValue()).replace('urn:fhirq:conformance:ValueSet/route', 'urn:example:ValueSet/elsewhere');
  await text(page).fill(edited);
  await expect(sample(page).locator('option:checked')).toHaveText('Your own');
  await expect(outcome(page)).toContainText('Loaded, with 1 diagnostic.');
  await expect(outcome(page)).toContainText('warning resolver-failed at the questionnaire, on urn:example:ValueSet/elsewhere');
  await expect(form(page).getByText('The choices could not be loaded')).toBeVisible();
  await form(page).getByRole('button', { name: 'Try again' }).click();
  // Held nowhere, so it fails again: a second finding, and the retry is back.
  await expect(outcome(page)).toContainText('Loaded, with 2 diagnostics.');
  await expect(form(page).getByRole('button', { name: 'Try again' })).toBeVisible();
});
