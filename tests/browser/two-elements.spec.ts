import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { openTwo } from './pages/serve.js';

/**
 * M7 AC-9, NFR-C-06: two elements on one page, on the same questionnaire,
 * each with its own session. Both draw the same ids, from the fixed prefix,
 * and each shadow root keeps its own apart (ADR-0014): no id repeats within a
 * root or reaches the document, every id reference resolves in its own root,
 * each control is named by its own label, a summary link focuses its own
 * element's control, and typing into one changes nothing in the other.
 * Chromium, Firefox and WebKit.
 */

const REASON = 'What is the main reason for your visit?';
const PAIN = 'Are you in pain today?';

const elements = (page: Page) => page.locator('fhir-questionnaire');

/** Shows the pain score, and asks both sessions to complete, so the summary and error references are drawn too. */
async function surfaceErrors(page: Page): Promise<void> {
  for (const index of [0, 1]) {
    await elements(page).nth(index).getByRole('radiogroup', { name: PAIN }).getByRole('radio', { name: 'Yes' }).check();
  }
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement & { requestCompletion(): void }>('fhir-questionnaire')) element.requestCompletion();
  });
  for (const index of [0, 1]) await expect(elements(page).nth(index).getByRole('region', { name: 'There is a problem' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openTwo(page);
  await expect(elements(page)).toHaveCount(2);
});

test('each root has ids of its own: none repeats in a root, none reaches the document, and both draw the same', async ({ page }) => {
  await surfaceErrors(page);
  const ids = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('fhir-questionnaire')].map((element) => element.shadowRoot);
    const each = roots.map((root) => [...(root?.querySelectorAll('[id]') ?? [])].map(({ id }) => id));
    return { each, inDocument: each.flat().filter((id) => document.getElementById(id) !== null) };
  });
  const [first, second] = ids.each;
  expect(first?.length).toBeGreaterThan(20);
  for (const own of ids.each) expect(new Set(own).size).toBe(own.length);
  expect(ids.inDocument).toEqual([]);
  // The same ids in both: only the shadow roots keep them apart.
  expect(second).toEqual(first);
});

test('every id reference resolves in its own root, and each control is named by its own label', async ({ page }) => {
  await surfaceErrors(page);
  const unresolved = await page.evaluate(() =>
    [...document.querySelectorAll('fhir-questionnaire')].flatMap((element, index) => {
      const root = element.shadowRoot;
      if (root === null) return [`element ${String(index)}: no shadow root`];
      const refs = [...root.querySelectorAll('[for], [aria-labelledby], [aria-describedby], [aria-controls], a[href^="#"]')].flatMap((node) =>
        [
          node.getAttribute('for'),
          node.getAttribute('aria-labelledby'),
          node.getAttribute('aria-describedby'),
          node.getAttribute('aria-controls'),
          node.getAttribute('href')?.slice(1),
        ].flatMap((value) => value?.split(' ').filter((id) => id !== '') ?? []),
      );
      const missing = refs.filter((id) => root.getElementById(id) === null).map((id) => `element ${String(index)}: #${id} not in its root`);
      const labels = [...root.querySelectorAll<HTMLLabelElement>('label[for]')].filter((label) => {
        const control = root.getElementById(label.htmlFor);
        return !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) || ![...(control.labels ?? [])].includes(label);
      });
      return [...missing, ...labels.map((label) => `element ${String(index)}: label for #${label.htmlFor} names no control of its root`)];
    }),
  );
  expect(unresolved).toEqual([]);
  for (const index of [0, 1]) {
    await expect(elements(page).nth(index).getByRole('textbox', { name: REASON, exact: true })).toHaveCount(1);
    await expect(elements(page).nth(index).getByRole('radiogroup', { name: PAIN })).toHaveCount(1);
  }
});

test("a summary link focuses its own element's control", async ({ page }) => {
  await surfaceErrors(page);
  for (const [index, other] of [
    [1, 0],
    [0, 1],
  ] as const) {
    const link = elements(page).nth(index).getByRole('link', { name: /reason for your visit/i });
    await link.click();
    const focus = await page.evaluate(
      ([mine, theirs]) => {
        const all = [...document.querySelectorAll('fhir-questionnaire')];
        const element = all[mine];
        return {
          host: document.activeElement === element,
          id: element?.shadowRoot?.activeElement?.id ?? null,
          otherFocused: all[theirs]?.shadowRoot?.activeElement ?? null,
        };
      },
      [index, other] as const,
    );
    expect(focus).toEqual({ host: true, id: (await link.getAttribute('href'))?.slice(1), otherFocused: null });
    await expect(elements(page).nth(index).getByRole('textbox', { name: REASON, exact: true })).toBeFocused();
  }
});

test('typing into one element changes nothing in the other', async ({ page }) => {
  const untouched = () =>
    page.evaluate(() => {
      const { sessions } = (window as unknown as TestWindow).fhirq;
      const snapshot = sessions?.[1]?.getSnapshot();
      return { cycle: snapshot?.cycle, answers: snapshot?.nodes.map(({ path, answers }) => [path, answers]) };
    });
  const before = await untouched();
  await page.evaluate(() => {
    const [, other] = document.querySelectorAll('fhir-questionnaire');
    const seen = { mutations: 0, changes: [0, 0] };
    if (other?.shadowRoot !== null && other?.shadowRoot !== undefined) {
      new MutationObserver((records) => {
        seen.mutations += records.length;
      }).observe(other.shadowRoot, { subtree: true, childList: true, attributes: true, characterData: true });
    }
    document.querySelectorAll('fhir-questionnaire').forEach((element, index) =>
      element.addEventListener('fhirq-change', () => {
        seen.changes[index] = (seen.changes[index] ?? 0) + 1;
      }),
    );
    Object.assign(window, { seen });
  });

  const typed = elements(page).nth(0).getByRole('textbox', { name: REASON, exact: true });
  await typed.click();
  await page.keyboard.type('A sore knee');
  await elements(page).nth(0).getByRole('radiogroup', { name: PAIN }).getByRole('radio', { name: 'Yes' }).check();

  await expect(typed).toHaveValue('A sore knee');
  await expect(elements(page).nth(0).getByRole('textbox', { name: /how strong is it\?$/ })).toBeVisible();
  await expect(elements(page).nth(1).getByRole('textbox', { name: REASON, exact: true })).toHaveValue('');
  await expect(elements(page).nth(1).getByRole('textbox', { name: /how strong is it\?$/ })).toHaveCount(0);
  expect(await untouched()).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { seen: unknown }).seen)).toEqual({ mutations: 0, changes: ['A sore knee'.length + 1, 0] });
});
