import { expect, test, type Page } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * Paste your own questionnaire (M9 AC-4, AC-12.3.1): valid JSON re-renders
 * the form; invalid or unsupported input shows every load finding, each with
 * its conformance rows linked. Strict by default, lenient on request (plan D6).
 */

const MATRIX = 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/conformance/matrix.json#L';

const editor = (page: Page) => page.getByRole('region', { name: 'Paste your own Questionnaire', exact: true });
const text = (page: Page) => editor(page).getByLabel('Questionnaire JSON');
const outcome = (page: Page) => editor(page).getByRole('status');
const form = (page: Page) => page.getByRole('region', { name: 'Demonstration form', exact: true });

const questionnaire = (item: readonly object[]) => JSON.stringify({ resourceType: 'Questionnaire', status: 'active', item }, null, 2);
const attachment = questionnaire([
  { linkId: 'name', text: 'What should we call you?', type: 'string' },
  { linkId: 'photo', text: 'A photo of the rash', type: 'attachment' },
]);

test.beforeEach(async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
});

test('opens on the demo, and re-renders the form from pasted JSON (AC-4)', async ({ page }) => {
  await expect(text(page)).toHaveValue(/"resourceType": "Questionnaire"/);
  await text(page).fill(questionnaire([{ linkId: 'name', text: 'What should we call you?', type: 'string' }]));
  await expect(form(page).getByLabel('What should we call you?')).toBeVisible();
  await expect(form(page).getByRole('radiogroup', { name: 'Are you in pain today?' })).toHaveCount(0);
  await expect(outcome(page)).toContainText('Loaded, with no diagnostics. The demo host code is off');
  await expect(page.getByText('Wellbeing score')).toHaveCount(0);
  // The panes follow the form's session.
  await expect(page.getByRole('region', { name: 'The emitted QuestionnaireResponse', exact: true })).not.toContainText('pain-now');
});

test('says what is wrong with text that is not JSON, and keeps the last form', async ({ page }) => {
  await text(page).fill('{ "resourceType": "Questionnaire", ');
  await expect(outcome(page)).toContainText('Not JSON:');
  await expect(form(page).getByRole('radiogroup', { name: 'Are you in pain today?' })).toBeVisible();
});

test('refuses unsupported input in strict mode, with every finding and its conformance rows (AC-4)', async ({ page }) => {
  await text(page).fill(attachment);
  await expect(outcome(page)).toContainText('Refused (definition-rejected), with 1 finding.');
  const finding = outcome(page).getByRole('listitem').filter({ hasText: 'unsupported-item-type' });
  await expect(finding).toContainText('error unsupported-item-type at photo, on attachment');
  const rows = finding.getByRole('list', { name: 'Conformance rows' });
  await expect(rows.getByRole('link')).toHaveText(['item-type.attachment']);
  await expect(rows.getByRole('listitem')).toContainText('Item type attachment. not supported. Outside the supported item types');
  await expect(rows.getByRole('link', { name: 'item-type.attachment' })).toHaveAttribute('href', new RegExp(`^${MATRIX.replaceAll('.', '\\.')}\\d+$`));
  // Refused, so the form is still the demo.
  await expect(form(page).getByLabel('A photo of the rash')).toHaveCount(0);
});

test('loads it in lenient mode, beside the same finding as a warning (plan D6)', async ({ page }) => {
  await text(page).fill(attachment);
  await expect(outcome(page)).toContainText('Refused');
  await editor(page).getByRole('radio', { name: /Lenient/ }).check();
  await expect(outcome(page)).toContainText('Loaded, with 1 diagnostic.');
  await expect(outcome(page)).toContainText('unsupported-item-type at photo');
  await expect(form(page).getByLabel('What should we call you?')).toBeVisible();
});

test('shows every finding of an input that is not a questionnaire at all', async ({ page }) => {
  await text(page).fill('{ "resourceType": "Patient" }');
  await expect(outcome(page)).toContainText('not-a-questionnaire at the questionnaire');
  await expect(outcome(page).getByRole('link', { name: 'definition.r4-shape' })).toBeVisible();
});
