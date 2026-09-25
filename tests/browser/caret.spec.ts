import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { open, reach } from './pages/serve.js';

/**
 * M1 AC-7, R4's thin proof: typing into the element's string item never
 * loses focus or caret across a cycle, including a cycle that changes the
 * input's own ARIA state. Run in Chromium, Firefox and WebKit (M7 plan D8);
 * WebKit was the one expected to break first. M7 AC-5 carries it to every
 * entry kind and to a repeating question's entries (plan step 3b).
 */

interface Probe {
  sameNode: boolean;
  value: string;
  selectionStart: number | null;
  invalid: string | null;
  cycle: number;
}

/** Tags the focused input so a replaced node would be noticed. */
async function tagFocused(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.querySelector('fhir-questionnaire')?.shadowRoot?.activeElement;
    if (active !== null && active !== undefined) active.setAttribute('data-probe', 'focused');
  });
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const shadow = document.querySelector('fhir-questionnaire')?.shadowRoot;
    const active = shadow?.activeElement;
    const input = active instanceof HTMLInputElement ? active : null;
    return {
      sameNode: input?.getAttribute('data-probe') === 'focused',
      value: input?.value ?? '',
      selectionStart: input?.selectionStart ?? null,
      invalid: input?.getAttribute('aria-invalid') ?? null,
      cycle: (window as unknown as TestWindow).fhirq.session.getSnapshot().cycle,
    };
  });
}

/** Waits until the session has settled the given answer: the cycle has run. */
async function cycleSettled(page: Page, answer: string | undefined): Promise<void> {
  await page.waitForFunction(
    (expected) => (window as unknown as TestWindow).fhirq.session.getSnapshot().nodes[1]?.answers[0]?.value === (expected ?? undefined),
    answer ?? null,
  );
}

test.describe('the element keeps focus and caret across cycles (M1 AC-7)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'element');
    await reach(page, 'string-shown');
    await page.getByRole('textbox').focus();
    await tagFocused(page);
  });

  test('typing at the end, one cycle per keystroke', async ({ page }) => {
    const before = await probe(page);
    await page.keyboard.type('abc');
    await cycleSettled(page, 'abc');

    expect(await probe(page)).toEqual({ sameNode: true, value: 'abc', selectionStart: 3, invalid: 'false', cycle: before.cycle + 3 });
  });

  test('inserting in the middle of the text', async ({ page }) => {
    await page.keyboard.type('abc');
    await cycleSettled(page, 'abc');
    await page.evaluate(() => {
      const input = document.querySelector('fhir-questionnaire')?.shadowRoot?.activeElement;
      if (input instanceof HTMLInputElement) input.setSelectionRange(1, 1);
    });

    await page.keyboard.type('X');
    await cycleSettled(page, 'aXbc');

    expect(await probe(page)).toMatchObject({ sameNode: true, value: 'aXbc', selectionStart: 2 });
  });

  test('a cycle that flips the input’s own invalid state, both ways', async ({ page }) => {
    // Leave empty, back to the question before: the required issue surfaces
    // on this input. Tabbing forward would leave the page, which Firefox under
    // Playwright does not do.
    await page.keyboard.press('Shift+Tab');
    const input = page.getByRole('textbox');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.focus();
    await tagFocused(page);

    await page.keyboard.type('a');
    await cycleSettled(page, 'a');
    expect(await probe(page)).toMatchObject({ sameNode: true, selectionStart: 1, invalid: 'false' });

    await page.keyboard.press('Backspace');
    await cycleSettled(page, undefined);
    expect(await probe(page)).toMatchObject({ sameNode: true, value: '', selectionStart: 0, invalid: 'true' });
  });
});

/** Every entry kind on the element's kinds page: what is typed at the end, then one character typed after the first. */
const ENTRY_KINDS = [
  { path: 'name', kind: 'short-text', typed: 'Ada', insert: 'X' },
  { path: 'notes', kind: 'long-text', typed: 'one', insert: 'X' },
  { path: 'age', kind: 'integer', typed: '42', insert: '7' },
  { path: 'height', kind: 'decimal', typed: '1.8', insert: '7' },
  { path: 'born', kind: 'calendar-date', typed: '2024-05', insert: '0' },
  // With its offset: the element has no time zone to read a wall clock in until M7 plan step 5.
  { path: 'seen', kind: 'date-time', typed: '2024-05-01T14:30+02:00', insert: '0' },
  { path: 'weight', kind: 'quantity with a unit list', typed: '70', insert: '5' },
  { path: 'dose', kind: 'quantity with a typed unit', typed: '5', insert: '2' },
] as const;

/** Marks the focused field with `token`, so a replaced node would be noticed. */
async function mark(page: Page, token: string): Promise<void> {
  await page.evaluate((value) => document.querySelector('fhir-questionnaire')?.shadowRoot?.activeElement?.setAttribute('data-probe', value), token);
}

/** The focused field: whether it is the node marked `token`, its text and its caret. */
async function focused(page: Page, token: string): Promise<{ sameNode: boolean; value: string; selectionStart: number | null }> {
  return page.evaluate((value) => {
    const active = document.querySelector('fhir-questionnaire')?.shadowRoot?.activeElement;
    const field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    return { sameNode: field?.getAttribute('data-probe') === value, value: field?.value ?? '', selectionStart: field?.selectionStart ?? null };
  }, token);
}

async function answers(page: Page, path: string): Promise<unknown[]> {
  return page.evaluate(
    (at) => (window as unknown as TestWindow).fhirq.session.getSnapshot().nodes.find((node) => node.path === at)?.answers.map((answer) => answer.value) ?? [],
    path,
  );
}

test.describe('the element keeps focus and caret in every entry kind (M7 AC-5, plan step 3b)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'element', 'kinds');
  });

  for (const { path, kind, typed, insert } of ENTRY_KINDS) {
    test(`${kind}: typing at the end, then after the first character`, async ({ page }) => {
      await page.locator(`[data-path="${path}"] .fhirq-control`).focus();
      await mark(page, path);

      await page.keyboard.type(typed);
      expect(await focused(page, path)).toEqual({ sameNode: true, value: typed, selectionStart: typed.length });
      expect(await answers(page, path)).toHaveLength(1);

      await page.evaluate(() => {
        const field = document.querySelector('fhir-questionnaire')?.shadowRoot?.activeElement;
        if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.setSelectionRange(1, 1);
      });
      await page.keyboard.type(insert);
      expect(await focused(page, path)).toEqual({ sameNode: true, value: `${typed.slice(0, 1)}${insert}${typed.slice(1)}`, selectionStart: 2 });
    });
  }

  test('a repeating question: each entry keeps focus and caret, and clearing a middle one leaves every field in place', async ({ page }) => {
    const fields = page.locator('[data-path="aliases"] .fhirq-entries > .fhirq-control');
    for (const [index, name] of ['Al', 'Bo', 'Cy'].entries()) {
      await fields.nth(index).focus();
      await mark(page, name);
      await page.keyboard.type(name);
      expect(await focused(page, name)).toEqual({ sameNode: true, value: name, selectionStart: 2 });
    }
    await expect(fields).toHaveCount(4);
    const entries = () => fields.evaluateAll((all) => all.map((field) => [field.getAttribute('data-probe'), (field as HTMLInputElement).value]));
    expect(await entries()).toEqual([['Al', 'Al'], ['Bo', 'Bo'], ['Cy', 'Cy'], [null, '']]);

    // Key by key, from the end of the middle entry: a cycle per key, the field kept throughout.
    await fields.nth(1).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    expect(await focused(page, 'Bo')).toEqual({ sameNode: true, value: 'B', selectionStart: 1 });
    await page.keyboard.press('Backspace');
    expect(await focused(page, 'Bo')).toEqual({ sameNode: true, value: '', selectionStart: 0 });
    expect(await entries()).toEqual([['Al', 'Al'], ['Bo', ''], ['Cy', 'Cy'], [null, '']]);
    expect(await answers(page, 'aliases')).toEqual(['Al', 'Cy']);

    await page.keyboard.type('Di');
    expect(await focused(page, 'Bo')).toEqual({ sameNode: true, value: 'Di', selectionStart: 2 });
    expect(await entries()).toEqual([['Al', 'Al'], ['Bo', 'Di'], ['Cy', 'Cy'], [null, '']]);
    expect(await answers(page, 'aliases')).toEqual(['Al', 'Di', 'Cy']);
  });
});
