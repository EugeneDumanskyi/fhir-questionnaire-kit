import { expect, test, type Page } from '@playwright/test';

import { PLAYGROUND, servePlayground } from './pages/playground.js';

/**
 * The tier and scheme switcher (M9 AC-6, AC-12.4.1): the form re-renders in
 * each of the four tiers over one session, so the answers stay, beside the
 * code that tier needs. The scheme control forces light or dark with tier-2
 * tokens (plan D8).
 */

const switcher = (page: Page) => page.getByRole('region', { name: 'Customization tiers', exact: true });
const tier = (page: Page, name: RegExp) => switcher(page).getByRole('group', { name: 'Tier' }).getByRole('radio', { name });
const scheme = (page: Page, name: string) => switcher(page).getByRole('radio', { name, exact: true });
const code = (page: Page, n: number) => switcher(page).getByRole('region', { name: `The code for tier ${n}`, exact: true });
const form = (page: Page) => page.getByRole('region', { name: 'Demonstration form', exact: true });
const painNow = (page: Page) => form(page).getByLabel(/Are you in pain today/);
const painScore = (page: Page) => form(page).getByLabel(/how strong is it/);

const kitMarkup = (page: Page) => form(page).locator('[class*="fhirq-"]');
const token = (page: Page, name: string) => page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);

test.beforeEach(async ({ page }) => {
  await servePlayground(page);
  await page.goto(PLAYGROUND);
});

test('keeps the answers through all four tiers, each beside its own code (AC-6)', async ({ page }) => {
  await expect(tier(page, /Defaults/)).toBeChecked();
  await expect(code(page, 1)).toContainText('<Questionnaire session={session} messages={messages} />');
  await expect(kitMarkup(page).first()).toBeVisible();
  await form(page).getByRole('radiogroup', { name: /Are you in pain today/ }).getByRole('radio', { name: 'Yes' }).check();
  await painScore(page).fill('4');
  await painScore(page).blur();

  // Tier 2: the same form in the host's design system.
  await tier(page, /Tokens/).check();
  await expect(code(page, 2)).toContainText('--fhirq-color-accent: var(--ds-brand);');
  await expect(form(page).locator('.intake')).toHaveCSS('font-family', /Georgia/);
  await expect(form(page).getByRole('radiogroup', { name: /Are you in pain today/ }).getByRole('radio', { name: 'Yes' })).toBeChecked();
  await expect(painScore(page)).toHaveValue('4');

  // Tier 3: the host's own control for yes-or-no questions, a menu.
  await tier(page, /Slots/).check();
  await expect(code(page, 3)).toContainText("const controls = { 'yes-no': YesNo };");
  await expect(painNow(page)).toHaveValue('true');
  await painNow(page).selectOption({ label: 'No' });
  await expect(painScore(page)).toHaveCount(0);

  // Tier 4: no kit markup at all; the hidden answer is still held.
  await tier(page, /Headless/).check();
  await expect(code(page, 4)).toContainText('useQuestionnaire(session, { messages })');
  await expect(kitMarkup(page)).toHaveCount(0);
  await expect(painNow(page)).toHaveValue('false');
  await painNow(page).selectOption({ label: 'Yes' });
  await expect(painScore(page)).toHaveValue('4');

  // Back to the defaults, with every answer as tier 4 left it.
  await tier(page, /Defaults/).check();
  await expect(form(page).getByRole('radiogroup', { name: /Are you in pain today/ }).getByRole('radio', { name: 'Yes' })).toBeChecked();
  await expect(painScore(page)).toHaveValue('4');
});

test('forces light or dark with the preset colours, whatever the system prefers (plan D8)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(scheme(page, 'System')).toBeChecked();
  expect(await token(page, '--fhirq-color-background')).toBe('#121316');

  await scheme(page, 'Light').check();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
  expect(await token(page, '--fhirq-color-background')).toBe('#ffffff');
  await tier(page, /Tokens/).check();
  await expect(form(page).locator('.intake')).toHaveCSS('background-color', 'rgb(251, 250, 247)');

  await page.emulateMedia({ colorScheme: 'light' });
  await scheme(page, 'Dark').check();
  await expect(form(page).locator('.intake')).toHaveCSS('background-color', 'rgb(11, 18, 32)');
  await tier(page, /Defaults/).check();
  expect(await token(page, '--fhirq-color-background')).toBe('#121316');

  await scheme(page, 'System').check();
  await expect(page.locator('html')).not.toHaveAttribute('data-scheme');
  expect(await token(page, '--fhirq-color-background')).toBe('#ffffff');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test('fits every tier and its code without scrolling sideways', async ({ page }) => {
    for (const name of [/Defaults/, /Tokens/, /Slots/, /Headless/]) {
      await tier(page, name).check();
      await expect(painNow(page).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), String(name)).toBeLessThanOrEqual(375);
    }
  });
});
