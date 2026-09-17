import { expect, test, type Page } from '@playwright/test';

import { open, reach } from './pages/serve.js';

/**
 * M1 AC-8, ADR-0014: the element renders under
 * `default-src 'self'; script-src 'self'; style-src 'self'` with no `<style>`,
 * no `style` attribute and no `el.style` write, and its token-derived styles
 * are applied. Both engines; WebKit exercises `adoptedStyleSheets`.
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

    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
      if (name.toLowerCase() === 'style') csp.writes.push('setAttribute');
      setAttribute.call(this, name, value);
    };
    const createElement = Document.prototype.createElement;
    Document.prototype.createElement = function (this: Document, tag: string, options?: ElementCreationOptions) {
      if (tag.toLowerCase() === 'style') csp.writes.push('createElement');
      return createElement.call(this, tag, options);
    } as typeof Document.prototype.createElement;

    const owner = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style') !== undefined ? HTMLElement.prototype : Element.prototype;
    const style = Object.getOwnPropertyDescriptor(owner, 'style');
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
