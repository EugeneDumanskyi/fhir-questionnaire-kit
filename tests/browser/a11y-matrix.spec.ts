import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { recordedAudit, TAGS } from './axe.js';
import type { TestWindow } from './fhirq.js';
import { MATRIX_FORMS, MATRIX_TIERS, type MatrixForm, type MatrixRenderer, type Tier } from './pages/names.js';
import { matrixPage, open, ORIGIN, serve } from './pages/serve.js';

/**
 * M8 AC-1, NFR-A-01, AC-11.5.1: 0 axe violations at WCAG 2.0, 2.1 and 2.2 A
 * and AA across the demo and the form of every kind × each renderer's tiers
 * × loaded, answered and refused × light and dark × 375 and 1280 px (plan
 * D4). Chromium, since axe's results do not depend on the engine; React 19,
 * since 18 is hydration's. Each run is recorded for the published report
 * (`scripts/a11y-report.mjs`). It replaces M1's thin proof on the slice.
 */

type State = 'loaded' | 'answered' | 'refused';
type Command = { type: 'SetAnswer'; path: string; answers: { kind: string; value: unknown }[] } | { type: 'AddRepeatInstance'; path: string };

const one = (path: string, kind: string, value: unknown): Command => ({ type: 'SetAnswer', path, answers: [{ kind, value }] });
const option = (code: string) => ({ system: 'urn:test', code, display: `Option ${code.slice(1)}` });

/**
 * What a respondent answers, through the session so every tier takes it
 * alike: enough to open the demo's conditional items and add an instance,
 * and a value of every kind the form of every kind has.
 */
const ANSWERS: Readonly<Record<MatrixForm, readonly Command[]>> = {
  demo: [
    one('visit/visit-reason', 'string', 'A check-up'),
    one('pain/pain-now', 'boolean', true),
    one('pain/pain-score', 'integer', 8),
    one('pain/pain-onset', 'dateTime', '2024-05-01T09:30:00+01:00'),
    one('body/weight', 'quantity', { value: 70, unit: 'kg' }),
    one('smoking/smoking-status', 'coding', { code: 'current', display: 'I smoke now' }),
    one('smoking/smoking-per-day', 'integer', 5),
    one('medicine[0]/medicine-name', 'string', 'Paracetamol'),
    one('medicine[0]/medicine-as-needed', 'boolean', false),
    { type: 'AddRepeatInstance', path: 'medicine' },
    one('allergies/allergies-any', 'boolean', true),
  ],
  kinds: [
    one('name', 'string', 'Ada'),
    one('notes', 'string', 'None'),
    one('age', 'integer', 40),
    one('height', 'decimal', 1.7),
    one('born', 'date', '1990-05'),
    one('seen', 'dateTime', '2024-05-01T09:30:00+01:00'),
    one('weight', 'quantity', { value: 70, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' }),
    { type: 'SetAnswer', path: 'aliases', answers: ['A', 'B'].map((value) => ({ kind: 'string', value })) },
    one('smoker', 'boolean', true),
    one('colour', 'coding', option('o1')),
    one('country', 'coding', option('o5')),
    one('size', 'coding', option('o2')),
    { type: 'SetAnswer', path: 'pets', answers: [option('o1'), option('o3')].map((value) => ({ kind: 'coding', value })) },
    { type: 'SetAnswer', path: 'foods', answers: [option('o2')].map((value) => ({ kind: 'coding', value })) },
    one('route', 'coding', option('o2')),
    { type: 'AddRepeatInstance', path: 'meds' },
  ],
};

/** A question each form shows only once answered, the demo's behind `enableWhen`. */
const SHOWN: Readonly<Record<MatrixForm, string>> = { demo: 'When did the strong pain start?', kinds: 'Medicine 2' };

async function reachState(page: Page, form: MatrixForm, state: State): Promise<void> {
  if (state === 'loaded') return;
  if (state === 'answered') {
    const unanswered = await page.evaluate((commands) => {
      const { session } = (window as unknown as TestWindow).fhirq;
      for (const command of commands) session.dispatch(command);
      const answered = new Map(session.getSnapshot().nodes.map((node) => [node.path, node.answers.length]));
      return commands.filter((command) => command.type === 'SetAnswer' && answered.get(command.path) !== command.answers.length).map((command) => command.path);
    }, ANSWERS[form]);
    expect(unanswered, 'answers the session refused').toEqual([]);
    await page.getByText(SHOWN[form], { exact: true }).first().waitFor();
    return;
  }
  await page.evaluate(() => (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' }));
  await page.getByRole('region', { name: 'There is a problem' }).waitFor();
}

for (const renderer of Object.keys(MATRIX_TIERS) as MatrixRenderer[])
  for (const tier of MATRIX_TIERS[renderer] as readonly Tier[])
    for (const form of MATRIX_FORMS)
      for (const state of ['loaded', 'answered', 'refused'] as const)
        for (const scheme of ['light', 'dark'] as const)
          for (const width of [375, 1280])
            test(`axe: ${renderer}, tier ${String(tier)}, ${form}, ${state}, ${scheme}, ${String(width)} px`, async ({ page }) => {
              await page.emulateMedia({ colorScheme: scheme });
              await page.setViewportSize({ width, height: 800 });
              await serve(page);
              await page.goto(`${ORIGIN}${matrixPage(renderer, tier, form)}`);
              await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
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
