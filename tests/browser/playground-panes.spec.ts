import { expect, test, type Page } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * The response next to the engine state (M9 AC-3, AC-12.2.1): hiding a
 * question takes its answer out of the emitted response, and the engine
 * state still holds it. Side by side on a wide screen, a toggle on a phone.
 */

const response = (page: Page) => page.getByRole('region', { name: 'The emitted QuestionnaireResponse', exact: true }).locator('code');
const state = (page: Page) => page.getByRole('region', { name: 'The engine state', exact: true }).locator('code');
const painNow = (page: Page) => page.getByRole('radiogroup', { name: 'Are you in pain today?' });

/** Answers the pain question yes and the score, then hides the score by answering no. */
async function answerThenHide(page: Page): Promise<void> {
  await painNow(page).getByRole('radio', { name: 'Yes' }).check();
  await page.getByLabel(/how strong is it/).fill('4');
  await page.getByLabel(/how strong is it/).blur();
  await expect(response(page)).toContainText('"linkId": "pain-score"');
  await painNow(page).getByRole('radio', { name: 'No' }).check();
  await expect(page.getByLabel(/how strong is it/)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
});

test.describe('on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows both side by side, and a hidden answer is in the state but not the response (AC-3)', async ({ page }) => {
    await expect(response(page)).toBeVisible();
    await expect(state(page)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Show' })).toBeHidden();
    const [left, right] = await Promise.all([response(page).boundingBox(), state(page).boundingBox()]);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    if (left === null || right === null) return;
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    expect(Math.abs(right.y - left.y)).toBeLessThan(1);

    await answerThenHide(page);
    await expect(response(page)).not.toContainText('pain-score');
    await expect(response(page)).toContainText('"linkId": "pain-now"');
    await expect(state(page)).toContainText('"pain/pain-score"');
    await expect(state(page)).toContainText('"value": 4');
  });

  test('brings the hidden answer back when the question shows again', async ({ page }) => {
    await answerThenHide(page);
    await painNow(page).getByRole('radio', { name: 'Yes' }).check();
    await expect(page.getByLabel(/how strong is it/)).toHaveValue('4');
    await expect(response(page)).toContainText('"linkId": "pain-score"');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test('shows one at a time, with a toggle between them', async ({ page }) => {
    const toggle = page.getByRole('group', { name: 'Show' });
    await expect(response(page)).toBeVisible();
    await expect(state(page)).toBeHidden();
    await expect(toggle.getByRole('button', { name: 'Response' })).toHaveAttribute('aria-pressed', 'true');

    await answerThenHide(page);
    await toggle.getByRole('button', { name: 'Engine state' }).tap();
    await expect(state(page)).toBeVisible();
    await expect(response(page)).toBeHidden();
    await expect(state(page)).toContainText('"pain/pain-score"');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
