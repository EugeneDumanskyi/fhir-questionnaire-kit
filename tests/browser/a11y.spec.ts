import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { open, reach } from './pages/serve.js';

/**
 * M1 AC-5, R8's thin proof: 0 axe violations on the slice, WCAG 2.0, 2.1 and
 * 2.2 at A and AA, in both renderers × light and dark × 375 and 1280 px × the
 * three states. Chromium only in M1; the full matrix is M8.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

for (const renderer of ['element', 'react-19'] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const width of [375, 1280]) {
      for (const state of ['initial', 'string-shown', 'errors-surfaced'] as const) {
        test(`axe: ${renderer}, ${colorScheme}, ${width}px, ${state}`, async ({ page, browserName }) => {
          test.skip(browserName !== 'chromium', 'Chromium only in M1 (06-roadmap.md M1 AC-5).');
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize({ width, height: 800 });
          await open(page, renderer);
          await reach(page, state);

          const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

          expect(results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
          // Not vacuous: the form's own controls were in what axe checked.
          const checked = results.passes.flatMap(({ nodes }) => nodes.map((node) => JSON.stringify(node.target)));
          expect(checked.some((target) => target.includes('fhirq-'))).toBe(true);
        });
      }
    }
  }
}

test('control: axe reaches into the shadow root and reports a defect there', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium only in M1.');
  await open(page, 'element');
  await page.evaluate(() => {
    const unlabelled = document.createElement('input');
    unlabelled.className = 'fhirq-control';
    document.querySelector('fhir-questionnaire')?.shadowRoot?.querySelector('.fhirq-form')?.append(unlabelled);
  });

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  expect(results.violations.map(({ id }) => id)).toContain('label');
});
