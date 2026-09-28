import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { ORIGIN, serve, TOKEN_PAGES } from './pages/serve.js';
import { SENTINELS, type Token } from './pages/sentinels.js';

/**
 * M8 AC-2 (AC-10.2.1): every documented token reaches the form in both
 * renderers. The demo, at its most medicines and with completion refused so
 * the add control's reason, the error summary and every error are drawn, is
 * served under a host stylesheet that sets every token to a sentinel no
 * preset token has: on the element itself, and on an ancestor of React's form
 * (ADR-0014, 2026-09-28 note). Each token is read back from one part that
 * `base.css` styles with it, and no part's colour or font size is left at a
 * preset value, light or dark. That a token on an ancestor of the element
 * does not reach inside is `isolation.spec.ts`'s.
 */

const FORM = { element: 'fhir-questionnaire .fhirq-form', react: '.sentinel #root .fhirq-form' } as const;
type Renderer = keyof typeof FORM;

/** Where each token shows: a part `base.css` styles with it, and the computed property, physical, as the form is left to right. */
const PROBES: Readonly<Record<Token, readonly [selector: string, property: string]>> = {
  '--fhirq-font-family': ['', 'font-family'],
  '--fhirq-font-size': ['', 'font-size'],
  '--fhirq-font-size-heading': ['.fhirq-summary-heading', 'font-size'],
  '--fhirq-font-size-subheading': ['.fhirq-group > .fhirq-label', 'font-size'],
  '--fhirq-font-weight-strong': ['.fhirq-label', 'font-weight'],
  '--fhirq-line-height': ['', 'line-height'],
  '--fhirq-space-1': ['.fhirq-required', 'margin-left'],
  '--fhirq-space-2': ['.fhirq-choices', 'row-gap'],
  '--fhirq-space-3': ['.fhirq-instance', 'padding-top'],
  '--fhirq-space-4': ['', 'row-gap'],
  '--fhirq-radius': ['.fhirq-control', 'border-top-left-radius'],
  '--fhirq-border-width': ['.fhirq-instance', 'border-top-width'],
  '--fhirq-error-bar-width': ['.fhirq-summary', 'border-left-width'],
  '--fhirq-focus-width': [':focus', 'outline-width'],
  '--fhirq-focus-offset': [':focus', 'outline-offset'],
  '--fhirq-target-size': ['.fhirq-add', 'min-height'],
  '--fhirq-radio-size': ['.fhirq-radio', 'width'],
  '--fhirq-color-text': ['', 'color'],
  '--fhirq-color-text-muted': ['.fhirq-reason', 'color'],
  '--fhirq-color-background': ['', 'background-color'],
  '--fhirq-color-control-background': ['.fhirq-control', 'background-color'],
  '--fhirq-color-border': ['.fhirq-instance', 'border-top-color'],
  '--fhirq-color-accent': ['.fhirq-radio', 'accent-color'],
  '--fhirq-color-focus': [':focus', 'outline-color'],
  '--fhirq-color-error': ['.fhirq-required', 'color'],
};

/** What a sentinel computes to: `--fhirq-line-height` is a factor of the sentinel font size. */
const computed = (token: Token) => (token === '--fhirq-line-height' ? `${String(parseFloat(SENTINELS['--fhirq-font-size']) * 2)}px` : SENTINELS[token]);

/** Every colour the preset gives, light and dark, as a computed style prints it. */
const PRESET_COLOURS = [...readFileSync(new URL('../../packages/themes/src/default.css', import.meta.url), 'utf8').matchAll(/#([0-9a-f]{6})\b/gi)].map(
  ([, hex = '']) => `rgb(${[0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`,
);
const COLOUR_PROPERTIES = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'accent-color'];
const FONT_SIZES = ['--fhirq-font-size', '--fhirq-font-size-heading', '--fhirq-font-size-subheading'] as const;

/** The demo at its 20 medicines, the most it takes, with completion refused. */
async function openSentinels(page: Page, renderer: Renderer): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}${TOKEN_PAGES[renderer]}`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
  await page.evaluate(() => {
    const { session } = (window as unknown as TestWindow).fhirq;
    for (let added = 1; added < 20; added += 1) session.dispatch({ type: 'AddRepeatInstance', path: 'medicine' } as { type: string });
    session.dispatch({ type: 'RequestCompletion' });
  });
  await page.getByRole('region', { name: 'There is a problem' }).waitFor();
  await expect(page.locator(`${FORM[renderer]} .fhirq-add[aria-disabled="true"]`)).toBeAttached();
}

/**
 * Each colour property and font size of every element in the form, keyed by
 * its place and property. A radio or checkbox is drawn by the platform in its
 * accent colour, which is probed; its text colour, border colours and font
 * size are the browser's own and paint nothing, so only its accent is read.
 */
function sweep(page: Page, renderer: Renderer) {
  return page.locator(FORM[renderer]).evaluate(
    (form, properties) => {
      const found: Record<string, string> = {};
      const walk = (element: Element, key: string) => {
        const style = getComputedStyle(element);
        const drawn = element.matches('.fhirq-radio, .fhirq-checkbox') ? ['accent-color'] : properties;
        for (const property of drawn) found[`${key} ${property}`] = style.getPropertyValue(property);
        [...element.children].forEach((child, index) => walk(child, `${key}>${child.tagName.toLowerCase()}:${String(index)}`));
      };
      walk(form, 'form');
      return found;
    },
    [...COLOUR_PROPERTIES, 'font-size'],
  );
}

for (const renderer of ['element', 'react'] as const)
  for (const scheme of ['light', 'dark'] as const)
    test(`${renderer} reads every token from the host (M8 AC-2): ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openSentinels(page, renderer);
      const form = page.locator(FORM[renderer]);
      await form.locator('input.fhirq-control').first().focus();

      for (const [token, [selector, property]] of Object.entries(PROBES) as [Token, readonly [string, string]][]) {
        const part = selector === '' ? form : form.locator(selector).first();
        await expect(part, `${token} on ${selector || '.fhirq-form'}`).toHaveCSS(property, computed(token));
      }

      const sizes = FONT_SIZES.map((token) => SENTINELS[token]);
      const kept = Object.entries(await sweep(page, renderer)).filter(([key, value]) =>
        key.endsWith(' font-size') ? !sizes.includes(value) : PRESET_COLOURS.includes(value),
      );
      expect(kept).toEqual([]);
    });
