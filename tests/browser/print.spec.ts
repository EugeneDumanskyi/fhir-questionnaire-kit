import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { open } from './pages/serve.js';

/**
 * Print (M8 plan D7): `base.css` prints both renderers, the element's shadow
 * root as well as React's light DOM. On the demo with a second medicine added
 * and completion refused, printing drops the controls that act only on screen
 * and the status region, keeps every repeat instance, the error summary and
 * each item's error, and prints the preset's light scheme even when the
 * reader's is dark.
 */

const FORM = { element: 'fhir-questionnaire .fhirq-form', 'react-19': '#root .fhirq-form' } as const;
const ON_SCREEN_ONLY = ['.fhirq-add', '.fhirq-remove', '.fhirq-status'];
/** `--fhirq-color-text`, light (default.css). */
const LIGHT_TEXT = 'rgb(27, 27, 31)';

async function refused(page: Page, renderer: keyof typeof FORM): Promise<void> {
  await open(page, renderer, 'demo');
  await page.locator('[data-path="medicine"] > .fhirq-add').click();
  await page.locator('[data-path="medicine[1]"]').waitFor();
  await page.evaluate(() => (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' }));
  await page.getByRole('region', { name: 'There is a problem' }).waitFor();
}

for (const renderer of ['element', 'react-19'] as const) {
  test(`${renderer} prints the answers and errors, not the screen-only controls (M8 plan D7)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await refused(page, renderer);
    const form = page.locator(FORM[renderer]);
    for (const selector of ON_SCREEN_ONLY) await expect(form.locator(selector).first(), `${selector} on screen`).toBeAttached();
    await expect(form.locator('.fhirq-add').first()).toBeVisible();
    await expect(form).not.toHaveCSS('color', LIGHT_TEXT);

    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    for (const selector of ON_SCREEN_ONLY) {
      for (const part of await form.locator(selector).all()) await expect(part, `${selector} in print`).toHaveCSS('display', 'none');
    }
    await expect(form.locator('.fhirq-instance')).toHaveCount(2);
    for (const instance of await form.locator('.fhirq-instance').all()) {
      await expect(instance).toBeVisible();
      await expect(instance).toHaveCSS('break-inside', 'avoid');
    }
    await expect(form.locator('.fhirq-summary')).toBeVisible();
    const errors = form.locator('.fhirq-error:not([hidden])');
    expect(await errors.count()).toBeGreaterThan(0);
    for (const error of await errors.all()) await expect(error).toBeVisible();
    await expect(form).toHaveCSS('color', LIGHT_TEXT);
  });
}
