import { expect, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import type { MatrixForm, MatrixRenderer, Tier } from './pages/names.js';
import { matrixPage, ORIGIN, serve } from './pages/serve.js';

/**
 * The three states M8's gates run each form in (plan D4): as loaded, answered
 * by a respondent, and with completion refused. Shared by the axe matrix and
 * the visual gates, so both read the same forms.
 */

export const STATES = ['loaded', 'answered', 'refused'] as const;
export type State = (typeof STATES)[number];
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

/** Takes an open page of the form to the state, the way a respondent and host would, through the session. */
export async function reachState(page: Page, form: MatrixForm, state: State): Promise<void> {
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

/** Opens a page of the matrix and waits until it is interactive. */
export async function openMatrix(page: Page, renderer: MatrixRenderer, tier: Tier, form: MatrixForm): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}${matrixPage(renderer, tier, form)}`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}
