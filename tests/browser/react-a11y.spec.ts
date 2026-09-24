import { expect, test } from '@playwright/test';

import { audit } from './axe.js';
import type { TestWindow } from './fhirq.js';
import { open } from './pages/serve.js';

/**
 * M6 plan D11, AC-1's "accessible": 0 axe violations at WCAG 2.2 A and AA on
 * the quickstart and the demo, on React 18 and 19, as hydrated and after an
 * empty submission is refused with every issue shown. Chromium, light, 1280
 * px: the matrix of renderers, tiers, themes and widths is M8 (NFR-A-01).
 */

for (const major of [18, 19] as const) {
  for (const form of ['quickstart', 'demo'] as const) {
    for (const state of ['hydrated', 'refused'] as const) {
      test(`axe: React ${major}, ${form}, ${state}`, async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Chromium only in M6 (plan D11); the full matrix is M8.');
        await open(page, `react-${major}`, form);
        if (state === 'refused') {
          if (form === 'quickstart') await page.getByRole('button', { name: 'Submit' }).click();
          else await page.evaluate(() => (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' }));
          await page.getByRole('region', { name: 'There is a problem' }).waitFor();
        }

        expect(await audit(page)).toEqual([]);
      });
    }
  }
}
