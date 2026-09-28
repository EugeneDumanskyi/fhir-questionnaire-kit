import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { ORIGIN, serve, THEMED_HOST } from './pages/serve.js';

/**
 * M8 AC-9, NFR-U-02: `examples/themed-host`'s one stylesheet reaches the form
 * in both renderers. The element is served as the example is on disk; React
 * renders the demo inside `.intake` with the kit's stylesheets and the
 * example's two after them. Each part the theme names reads the design
 * system's value, light and dark: the dark scheme is the host's, not the
 * preset's. The line count and the no-JavaScript rule are
 * `packages/themes/test/themed-host.test.ts`'s.
 */

const FORM = { element: 'fhir-questionnaire .fhirq-form', react: '#root .fhirq-form' } as const;

const designSystem = readFileSync(new URL('../../examples/themed-host/design-system.css', import.meta.url), 'utf8');
const [lightBlock = '', darkBlock = ''] = designSystem.split('@media (prefers-color-scheme: dark)');

/** The design system's variables, colours as a computed style prints them. */
const variables = (css: string) =>
  new Map(
    [...css.matchAll(/(--ds-[a-z-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => {
      const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value.trim());
      return [name, hex === null ? value.trim() : `rgb(${hex.slice(1).map((part) => parseInt(part, 16)).join(', ')})`];
    }),
  );
const SCHEMES = { light: variables(lightBlock), dark: new Map([...variables(lightBlock), ...variables(darkBlock)]) };

async function openHost(page: Page, renderer: keyof typeof FORM): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}${THEMED_HOST[renderer]}`);
  if (renderer === 'react') await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
  await expect(page.locator(FORM[renderer])).toBeVisible();
}

for (const renderer of ['element', 'react'] as const)
  for (const [scheme, ds] of Object.entries(SCHEMES))
    test(`${renderer} reads the host's design system through theme.css alone: ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme as 'light' | 'dark' });
      await openHost(page, renderer);
      const value = (name: string) => ds.get(name) ?? `missing ${name}`;
      const form = page.locator(FORM[renderer]);
      const control = form.locator('input.fhirq-control').first();

      // The root is 16 px, the design system's text 1.0625rem and its unit
      // 0.375rem. Engines differ in quoting a family and in rounding a size.
      await expect(form).toHaveCSS('font-family', /^Georgia, "?Times New Roman"?, serif$/);
      await expect(form).toHaveCSS('font-size', '17px');
      await expect(form).toHaveCSS('row-gap', '24px');
      await expect(form).toHaveCSS('color', value('--ds-ink'));
      await expect(form).toHaveCSS('background-color', value('--ds-paper'));
      await expect(form.locator('.fhirq-group > .fhirq-label').first()).toHaveCSS('font-size', /^20\.40?\d*px$/);
      await expect(control).toHaveCSS('border-top-left-radius', '8px');
      await expect(control).toHaveCSS('border-top-color', value('--ds-line'));
      await expect(control).toHaveCSS('background-color', value('--ds-surface'));
      await expect(form.locator('.fhirq-radio').first()).toHaveCSS('accent-color', value('--ds-brand'));
      await expect(form.locator('.fhirq-required').first()).toHaveCSS('color', value('--ds-danger'));

      await control.focus();
      await expect(control).toHaveCSS('outline-color', value('--ds-brand'));
    });
