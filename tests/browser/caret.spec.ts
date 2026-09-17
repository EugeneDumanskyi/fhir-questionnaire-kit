import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { open, reach } from './pages/serve.js';

/**
 * M1 AC-7, R4's thin proof: typing into the element's string item never
 * loses focus or caret across a cycle, including a cycle that changes the
 * input's own ARIA state. Run on both engines; WebKit is the one expected to
 * break first.
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
    // Leave empty: the required issue surfaces on this input.
    await page.keyboard.press('Tab');
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
