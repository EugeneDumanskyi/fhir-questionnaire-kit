import { expect, test, type Locator, type Page } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * The first screen on a phone (M9 AC-1, AC-2 and AC-5's statement; plan
 * D11): at 375 × 667, the sentence and a working form are in view with
 * nothing to dismiss, and the first answer reveals the next question there,
 * with no scrolling.
 */

test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

/** Wholly inside the viewport, not merely partly. */
async function inView(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}

test.beforeEach(async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
});

test('shows the sentence, the privacy statement and a working form above the fold, with no dialog (AC-1)', async ({ page }) => {
  const pitch = page.getByText('Renders a FHIR R4 Questionnaire as an accessible form');
  await expect(pitch).toBeVisible();
  await inView(page, pitch);

  const privacy = page.getByText('Nothing leaves your browser');
  await expect(privacy).toBeVisible();
  await inView(page, privacy);
  await expect(page.getByRole('link', { name: 'The policy' })).toHaveAttribute('href', '../adr/0019-static-client-only-playground-and-docs.html');

  const first = page.getByRole('radiogroup', { name: 'Are you in pain today?' });
  await inView(page, first);
  await expect(first.getByRole('radio', { name: 'Yes' })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('the first answer reveals the next question in view, with no scrolling (AC-2)', async ({ page }) => {
  const score = page.getByLabel(/how strong is it/);
  await expect(score).toHaveCount(0);
  await page.getByRole('radiogroup', { name: 'Are you in pain today?' }).getByRole('radio', { name: 'Yes' }).tap();
  await expect(score).toBeVisible();
  await inView(page, score);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('runs the host code it shows: the score and the cross-field rule', async ({ page }) => {
  const output = page.locator('.score output');
  await expect(output).toHaveText('answer both wellbeing questions');
  await page.getByRole('radiogroup', { name: /little energy/ }).getByRole('radio', { name: 'On most days' }).check();
  await page.getByRole('radiogroup', { name: /not left me rested/ }).getByRole('radio', { name: 'On some days' }).check();
  await expect(output).toHaveText('3 of 6');

  await page.getByLabel('Date of your appointment').fill('2026-10-01');
  await page.getByRole('radiogroup', { name: 'Do you smoke?' }).getByRole('radio', { name: 'I used to smoke' }).check();
  await page.getByLabel('When did you stop?').fill('2026-11-01');
  await page.getByLabel('When did you stop?').blur();
  await expect(page.getByText('The date you stopped cannot be after your appointment.', { exact: true })).toBeVisible();

  await page.getByText('The host code behind this form').click();
  await expect(page.locator('.host code')).toContainText("'demo-stopped-after-visit'");
});
