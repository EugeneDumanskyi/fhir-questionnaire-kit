import { expect, test, type Page } from '@playwright/test';

import { audit } from './axe.js';
import type { TestWindow } from './fhirq.js';
import { EMBED, open, ORIGIN, serve } from './pages/serve.js';

/**
 * M7 plan D8: 0 axe violations at WCAG 2.2 A and AA on the element's demo
 * page and on `examples/element-embed`, as loaded and after completion is
 * refused with every issue shown. Light, the default viewport, in
 * Chromium, Firefox and WebKit: the matrix of themes and widths is M8
 * (NFR-A-01).
 */

const refuse: Record<'demo' | 'embed', (page: Page) => Promise<unknown>> = {
  demo: (page) => page.evaluate(() => (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' })),
  embed: (page) => page.evaluate(() => document.querySelector<HTMLElement & { requestCompletion(): void }>('fhir-questionnaire')?.requestCompletion()),
};

for (const form of ['demo', 'embed'] as const) {
  for (const state of ['loaded', 'refused'] as const) {
    test(`axe: the element, ${form}, ${state}`, async ({ page }) => {
      if (form === 'demo') {
        await open(page, 'element', 'demo');
      } else {
        await serve(page);
        await page.goto(`${ORIGIN}${EMBED}`);
        await page.getByRole('radiogroup', { name: 'Are you in pain today?' }).waitFor();
      }
      if (state === 'refused') {
        await refuse[form](page);
        await page.getByRole('region', { name: 'There is a problem' }).waitFor();
      }

      expect(await audit(page)).toEqual([]);
    });
  }
}
