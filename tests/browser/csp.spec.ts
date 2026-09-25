import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import { EMBED, open, ORIGIN, reach, serve } from './pages/serve.js';

/**
 * M1 AC-8, ADR-0014: the element renders under
 * `default-src 'self'; script-src 'self'; style-src 'self'` with no `<style>`,
 * no `style` attribute and no `el.style` write, and its token-derived styles
 * are applied. Chromium, Firefox and WebKit (M7 plan D8); WebKit exercises
 * `adoptedStyleSheets`. On the S1 slice, and from M7 step 8 on the demo,
 * every kind it holds, and on `examples/element-embed`, the script-tag build
 * with no script of the page's own.
 */

interface Csp {
  instrumented: boolean;
  violations: string[];
  writes: string[];
}

/** Installed before any page script: counts every route to an inline style. */
async function instrument(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const csp = { instrumented: false, violations: [] as string[], writes: [] as string[] };
    Object.assign(window, { fhirqCsp: csp });
    document.addEventListener('securitypolicyviolation', (event) => csp.violations.push(event.violatedDirective), true);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- kept to be called on the original receiver with .call
    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      if (name.toLowerCase() === 'style') csp.writes.push('setAttribute');
      setAttribute.call(this, name, value);
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- kept to be called on the original receiver with .call
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, tag: string, options?: ElementCreationOptions) {
      if (tag.toLowerCase() === 'style') csp.writes.push('createElement');
      return createElement.call(this, tag, options);
    };

    const owner = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style') !== undefined ? HTMLElement.prototype : Element.prototype;
    const style = Object.getOwnPropertyDescriptor(owner, 'style');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- kept to be called on the original receiver with .call
    const getStyle = style?.get;
    if (getStyle === undefined) return;
    Object.defineProperty(owner, 'style', {
      configurable: true,
      get(this: HTMLElement) {
        const real = getStyle.call(this) as CSSStyleDeclaration;
        return new Proxy(real, {
          set(target, property, value) {
            csp.writes.push(`style.${String(property)}`);
            return Reflect.set(target, property, value);
          },
          get(target, property) {
            const value: unknown = Reflect.get(target, property);
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => {
              if (property === 'setProperty' || property === 'removeProperty') csp.writes.push(`style.${property}`);
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
          },
        });
      },
      set(this: HTMLElement, value: string) {
        csp.writes.push('style=');
        style?.set?.call(this, value);
      },
    });
    csp.instrumented = true;
  });
}

const readCsp = (page: Page) => page.evaluate(() => (window as unknown as { fhirqCsp: Csp }).fhirqCsp);

/** The routes to an inline style counted in the element's own tree and the page's, and what its stylesheets apply. */
const inside = (page: Page) =>
  page.evaluate(() => {
    const shadow = document.querySelector('fhir-questionnaire')?.shadowRoot;
    if (shadow === null || shadow === undefined) return null;
    const count = (selector: string) => document.querySelectorAll(selector).length + shadow.querySelectorAll(selector).length;
    const control = shadow.querySelector('.fhirq-control');
    return {
      styleElements: count('style'),
      styleAttributes: count('[style]'),
      adoptedSheets: shadow.adoptedStyleSheets.length,
      minBlockSize: control === null ? null : getComputedStyle(control).minHeight,
    };
  });

/** Every item of the demo that shows only once answered, answered, and then completion refused. */
async function useDemo(page: Page, refuse: () => Promise<void>): Promise<void> {
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
  await refuse();
  await page.getByRole('region', { name: 'There is a problem' }).waitFor();
}

test.describe('the element under a strict CSP (M1 AC-8, NFR-C-07)', () => {
  test('renders every state with no inline style of any kind, and its stylesheets applied', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await instrument(page);
    await open(page, 'element');
    await reach(page, 'errors-surfaced');
    await page.getByRole('textbox').fill('10');
    await page.getByRole('radio', { name: 'No' }).check();

    const csp = await readCsp(page);
    expect(csp).toEqual({ instrumented: true, violations: [], writes: [] });
    expect(errors).toEqual([]);

    await page.getByRole('radio', { name: 'Yes' }).check();
    const dom = await page.evaluate(() => {
      const shadow = document.querySelector('fhir-questionnaire')?.shadowRoot;
      if (shadow === null || shadow === undefined) return null;
      const count = (selector: string) => document.querySelectorAll(selector).length + shadow.querySelectorAll(selector).length;
      const computed = (selector: string) => {
        const target = shadow.querySelector(selector);
        return target === null ? null : getComputedStyle(target);
      };
      return {
        styleElements: count('style'),
        styleAttributes: count('[style]'),
        adoptedSheets: shadow.adoptedStyleSheets.length,
        minBlockSize: computed('.fhirq-control')?.minHeight,
        borderColor: computed('.fhirq-control')?.borderTopColor,
        labelWeight: computed('.fhirq-label')?.fontWeight,
      };
    });
    expect(dom).toEqual({
      styleElements: 0,
      styleAttributes: 0,
      adoptedSheets: 2,
      minBlockSize: '44px',
      borderColor: 'rgb(92, 95, 102)',
      labelWeight: '600',
    });
  });

  test('the demo: every kind it holds, used and refused, with no inline style of any kind', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await instrument(page);
    await open(page, 'element', 'demo');
    await useDemo(page, () => page.evaluate(() => void (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' })));

    expect(await readCsp(page)).toEqual({ instrumented: true, violations: [], writes: [] });
    expect(errors).toEqual([]);
    expect(await inside(page)).toEqual({ styleElements: 0, styleAttributes: 0, adoptedSheets: 2, minBlockSize: '44px' });
  });

  test('the embed: one script tag, used and refused, with no inline style of any kind', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await instrument(page);
    await serve(page);
    await page.goto(`${ORIGIN}${EMBED}`);
    await useDemo(page, () =>
      page.evaluate(() => document.querySelector<HTMLElement & { requestCompletion(): void }>('fhir-questionnaire')?.requestCompletion()),
    );

    expect(await readCsp(page)).toEqual({ instrumented: true, violations: [], writes: [] });
    expect(errors).toEqual([]);
    expect(await inside(page)).toEqual({ styleElements: 0, styleAttributes: 0, adoptedSheets: 2, minBlockSize: '44px' });
  });

  test('control: the policy is enforced and the instrumentation counts', async ({ page }) => {
    await instrument(page);
    await open(page, 'element');
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'body { color: red }';
      document.head.append(style);
      document.body.style.color = 'red';
    });
    await expect.poll(async () => (await readCsp(page)).violations.length).toBeGreaterThan(0);
    const csp = await readCsp(page);
    expect(csp.violations.some((directive) => directive.startsWith('style-src'))).toBe(true);
    expect(csp.writes).toEqual(['createElement', 'style.color']);
  });
});
