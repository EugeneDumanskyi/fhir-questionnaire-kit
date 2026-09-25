import { expect, test, type Locator, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { open } from './pages/serve.js';

/**
 * M1 AC-4, ADR-0007: one DOM contract (docs/08-dom-contract.md), asserted
 * against both renderers by one test. For every state, the two renderers must
 * produce the same tree of elements, classes, `part` names, roles and ARIA
 * attributes, with every id reference resolved *within the same root* and
 * described by what it points at, and the same accessible names. On the
 * demo from M7 (plan step 4), which is every kind the demo holds, in place
 * of M1's slice: React's server-rendered and hydrated, the element's
 * client-rendered.
 */

const FORM: Readonly<Record<'element' | 'react-19', string>> = {
  element: 'fhir-questionnaire .fhirq-form',
  'react-19': '#root .fhirq-form',
};

/** A renderer-neutral description of the form: ids replaced by what they resolve to. */
function describe(form: Locator) {
  return form.evaluate((root) => {
    const tree = root.getRootNode() as Document | ShadowRoot;
    const describeTarget = (id: string) => {
      const target = tree.getElementById(id);
      if (target === null) return `UNRESOLVED`;
      const item = target.closest('[data-path]')?.getAttribute('data-path');
      return `${target.tagName.toLowerCase()}.${target.getAttribute('class') ?? ''}${item === undefined ? '' : `@${item}`}`;
    };
    const REFERENCES = new Set(['aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-errormessage', 'for']);
    const OWN = new Set(['class', 'part', 'role', 'data-path']);
    // Properties, not attributes: React mirrors them into attributes, the patcher does not need to.
    // A textarea's text is its default value, which React mirrors in the same way.
    const PROPERTY_ONLY = new Set(['value', 'checked']);

    type Node = { tag: string; attributes: Record<string, string | string[] | boolean>; text: string; children: Node[]; state?: Record<string, unknown> };
    const walk = (element: Element): Node => {
      const attributes: Node['attributes'] = {};
      for (const { name, value } of element.attributes) {
        if (OWN.has(name)) attributes[name] = value;
        else if (name === 'id') attributes['id'] = true;
        else if (REFERENCES.has(name)) attributes[name] = value.split(/\s+/).map(describeTarget);
        else if (name === 'href') attributes['href'] = describeTarget(value.slice(1));
        else if (name === 'name') attributes['name'] = describeTarget(value);
        else if (!(element instanceof HTMLInputElement && PROPERTY_ONLY.has(name))) attributes[name] = value;
      }
      const text =
        element instanceof HTMLTextAreaElement
          ? ''
          : [...element.childNodes]
              .filter((child) => child.nodeType === 3)
              .map((child) => child.textContent ?? '')
              .join('');
      const node: Node = { tag: element.tagName.toLowerCase(), attributes, text, children: [...element.children].map(walk) };
      if (element instanceof HTMLInputElement) node.state = { value: element.value, checked: element.checked };
      if (element instanceof HTMLTextAreaElement) node.state = { value: element.value };
      return node;
    };
    return walk(root);
  });
}

/** The demo's three states: as loaded; answered so that every conditional item shows and a medicine is added; and completion refused. */
type DemoState = 'initial' | 'answered' | 'errors-surfaced';

/** Answers the demo as a respondent would, through each item's own controls. */
async function answer(page: Page): Promise<void> {
  const item = (path: string) => page.locator(`[data-path="${path}"]`);
  await item('pain/pain-now').getByRole('radio', { name: 'Yes' }).check();
  await item('pain/pain-score').getByRole('textbox').fill('8');
  await item('pain/pain-onset').getByRole('textbox').fill('2024-05-01T14:30+02:00');
  await item('pain/pain-tell-reception').waitFor();
  await item('body/weight').locator('.fhirq-control').fill('70');
  await item('body/weight').locator('.fhirq-unit').fill('kg');
  await item('smoking/smoking-status').getByRole('radio', { name: 'I smoke now' }).check();
  await item('smoking/smoking-per-day').getByRole('textbox').fill('10');
  await item('smoking/smoking-support').getByRole('radio', { name: 'No' }).check();
  await item('medicine[0]/medicine-name').getByRole('textbox').fill('Paracetamol');
  await item('medicine[0]/medicine-as-needed').getByRole('radio', { name: 'No' }).check();
  await item('medicine[0]/medicine-how-often').locator('.fhirq-other-text').fill('With food');
  await item('medicine').locator(':scope > .fhirq-add').click();
  await item('medicine[1]').waitFor();
  await item('allergies/allergies-any').getByRole('radio', { name: 'Yes' }).check();
  await item('allergies/allergies-detail').getByRole('textbox').fill('Pollen');
  await item('wellbeing/wellbeing-sleep').getByRole('radio', { name: 'On most days' }).check();
  await item('arrival-note').waitFor();
}

async function capture(page: Page, renderer: 'element' | 'react-19', state: DemoState) {
  await open(page, renderer, 'demo');
  if (state === 'answered') await answer(page);
  if (state === 'errors-surfaced') {
    await page.evaluate(() => (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' }));
    await page.getByRole('region', { name: 'There is a problem' }).waitFor();
  }
  const form = page.locator(FORM[renderer]);
  // Link URLs carry the renderer's id prefix; the DOM description already
  // asserts what each one resolves to.
  const aria = (await form.ariaSnapshot()).replace(/\/url: "#[^"]*"/g, '/url: "#<id>"');
  return { dom: await describe(form), aria };
}

for (const state of ['initial', 'answered', 'errors-surfaced'] as const) {
  test(`both renderers honour one DOM contract on the demo: ${state}`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'The contract is markup; one engine suffices.');
    const element = await capture(await browser.newPage(), 'element', state);
    const react = await capture(await browser.newPage(), 'react-19', state);

    expect(JSON.stringify(element.dom)).not.toContain('UNRESOLVED');
    expect(react.dom).toEqual(element.dom);
    expect(react.aria).toEqual(element.aria);
  });
}
