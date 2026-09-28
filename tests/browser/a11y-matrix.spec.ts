import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { recordedAudit, TAGS } from './axe.js';
import { MATRIX_FORMS, MATRIX_TIERS, type MatrixRenderer, type Tier } from './pages/names.js';
import { open } from './pages/serve.js';
import { openMatrix, reachState, STATES } from './states.js';

/**
 * M8 AC-1, NFR-A-01, AC-11.5.1: 0 axe violations at WCAG 2.0, 2.1 and 2.2 A
 * and AA across the demo and the form of every kind × each renderer's tiers
 * × loaded, answered and refused × light and dark × 375 and 1280 px (plan
 * D4). Chromium, since axe's results do not depend on the engine; React 19,
 * since 18 is hydration's. Each run is recorded for the published report
 * (`scripts/a11y-report.mjs`). It replaces M1's thin proof on the slice.
 */

for (const renderer of Object.keys(MATRIX_TIERS) as MatrixRenderer[])
  for (const tier of MATRIX_TIERS[renderer] as readonly Tier[])
    for (const form of MATRIX_FORMS)
      for (const state of STATES)
        for (const scheme of ['light', 'dark'] as const)
          for (const width of [375, 1280])
            test(`axe: ${renderer}, tier ${String(tier)}, ${form}, ${state}, ${scheme}, ${String(width)} px`, async ({ page }) => {
              await page.emulateMedia({ colorScheme: scheme });
              await page.setViewportSize({ width, height: 800 });
              await openMatrix(page, renderer, tier, form);
              await reachState(page, form, state);

              const name = `${renderer}-t${String(tier)}-${form}-${state}-${scheme}-${String(width)}`;
              const cell = { renderer, tier, form, state, scheme, width };
              expect(await recordedAudit(page, name, cell, tier === 4 ? '-control"' : 'fhirq-')).toEqual([]);
            });

test('control: axe reaches into the shadow root and reports a defect there', async ({ page }) => {
  await open(page, 'element', 'demo');
  await page.evaluate(() => {
    const unlabelled = document.createElement('input');
    unlabelled.className = 'fhirq-control';
    document.querySelector('fhir-questionnaire')?.shadowRoot?.querySelector('.fhirq-form')?.append(unlabelled);
  });

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  expect(results.violations.map(({ id }) => id)).toContain('label');
});
