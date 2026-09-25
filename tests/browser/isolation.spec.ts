import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import type { TestWindow } from './fhirq.js';
import type { HostStyle } from './pages/names.js';
import { open, openIsolation } from './pages/serve.js';

/**
 * M7 AC-4 and AC-7 (AC-09.2.1, AC-09.2.2, ADR-0014): the shadow root keeps
 * the host page's CSS out of the form and the form's out of the page, while
 * the holes ADR-0014 opens on purpose, `--fhirq-*` tokens and `::part()`,
 * let a host theme it. The demo on a host page with its own elements, under
 * each of the host stylesheets in `pages/host/`, compared with the same page
 * under its clean stylesheet or without the element, within the run.
 * Chromium, Firefox and WebKit (M7 plan D8).
 */

/** Every computed property of every element under `root`, keyed by its place in the tree. */
function styles(page: Page, root: 'form' | 'host') {
  return page.evaluate((root) => {
    const start = root === 'form' ? document.querySelector('fhir-questionnaire')?.shadowRoot : document.getElementById('host');
    const all: Record<string, Record<string, string>> = {};
    const walk = (element: Element, key: string) => {
      const computed = getComputedStyle(element);
      const properties: Record<string, string> = {};
      for (const name of computed) properties[name] = computed.getPropertyValue(name);
      all[key] = properties;
      [...element.children].forEach((child, index) => walk(child, `${key}>${child.tagName.toLowerCase()}:${String(index)}`));
    };
    [...(start?.children ?? [])].forEach((child, index) => walk(child, `${child.tagName.toLowerCase()}:${String(index)}`));
    return all;
  }, root);
}

type Styles = Awaited<ReturnType<typeof styles>>;

/**
 * Where the page put an absolutely positioned part, the visually hidden
 * status (`08-dom-contract.md` §2): its insets are `auto`, so they compute
 * to where it sits on the page, which moves with the host's own layout.
 */
const PLACEMENT = /^(top|right|bottom|left|inset-[a-z-]+)$/;

/** Each property that differs between two readings, as `place property: before → after`, placement aside. */
function differences(before: Styles, after: Styles): string[] {
  const found: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    if (a === undefined || b === undefined) {
      found.push(`${key}: ${a === undefined ? 'added' : 'removed'}`);
      continue;
    }
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[name] !== b[name] && !PLACEMENT.test(name)) found.push(`${key} ${name}: ${a[name] ?? '(none)'} → ${b[name] ?? '(none)'}`);
    }
  }
  return found;
}

/** The two states compared: the demo as loaded, and with completion refused, so the summary and every error show. */
type State = 'loaded' | 'refused';

async function reachState(page: Page, state: State): Promise<void> {
  if (state === 'loaded') return;
  await page.evaluate(() => (window as unknown as TestWindow).fhirq.session.dispatch({ type: 'RequestCompletion' }));
  await page.getByRole('region', { name: 'There is a problem' }).waitFor();
  // The summary takes focus; the other page must not differ by a focus ring.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** The form's computed styles and a screenshot of the element, on one host stylesheet. */
async function capture(page: Page, style: HostStyle, state: State) {
  await openIsolation(page, style, true);
  await reachState(page, state);
  return { styles: await styles(page, 'form'), shot: await page.locator('fhir-questionnaire').screenshot({ animations: 'disabled', caret: 'hide' }) };
}

for (const state of ['loaded', 'refused'] as const) {
  test(`hostile global CSS leaves the form as it is on a clean page: ${state}`, async ({ browser }) => {
    test.slow(true, 'Every computed property of every part, on two pages.');
    const clean = await capture(await browser.newPage(), 'clean', state);
    const hostile = await capture(await browser.newPage(), 'hostile', state);

    expect(Object.keys(clean.styles).length).toBeGreaterThan(100);
    expect(differences(clean.styles, hostile.styles)).toEqual([]);
    expect(hostile.shot.equals(clean.shot)).toBe(true);
  });
}

/**
 * FINDING, for the themes (M8): what the host page sets on its root, body or
 * everything reaches the element, and from it every part of the form that
 * does not set its own. ADR-0014 isolates selectors, not inheritance, and
 * the embedded slice of the theme sets the form's font, line height and
 * colours and no other text property. So the host's inherited ones cross, its
 * text decoration propagates, and every rem token is read against the host's
 * root font size. Recorded here exactly, so that the list can only shrink
 * on purpose; the font family crosses by design (ADR-0014) and is not set.
 */
const CROSSES = ['cursor', 'font-size', 'font-style', 'letter-spacing', 'min-block-size', 'text-align', 'text-transform', 'word-spacing'];

/** The properties `inherited.css` sets, read on a label and a control, and the one a decoration shows in where an engine exposes it. */
function inheritable(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('fhir-questionnaire')?.shadowRoot;
    const read = (selector: string, names: readonly string[]): Record<string, string | null> => {
      const target = root?.querySelector(selector);
      const computed = target === null || target === undefined ? null : getComputedStyle(target);
      return Object.fromEntries(names.map((name) => [name, computed?.getPropertyValue(name) ?? null]));
    };
    return {
      values: {
        ...read('.fhirq-label', ['color', 'cursor', 'font-size', 'font-style', 'letter-spacing', 'text-align', 'text-transform', 'word-spacing']),
        ...read('.fhirq-control', ['min-block-size']),
      },
      decorated: read('.fhirq-label', ['-webkit-text-decorations-in-effect'])['-webkit-text-decorations-in-effect'] ?? null,
    };
  });
}

test('inherited values from the host page reach the form: the recorded finding (M8)', async ({ browser, browserName }) => {
  const read = async (style: HostStyle) => {
    const page = await browser.newPage();
    await openIsolation(page, style, true);
    return { ...(await inheritable(page)), shot: await page.locator('fhir-questionnaire').screenshot({ animations: 'disabled', caret: 'hide' }) };
  };
  const clean = await read('clean');
  const inherited = await read('inherited');

  const crossed = Object.keys(clean.values)
    .filter((name) => clean.values[name] !== inherited.values[name])
    .sort();
  expect(crossed).toEqual(CROSSES);
  // The form sets its own colour, so the host's does not reach it.
  expect(inherited.values['color']).toBe(clean.values['color']);
  // Only Chromium exposes the decorations a box shows; the others are seen in the screenshot.
  if (browserName === 'chromium') expect([clean.decorated, inherited.decorated]).toEqual(['none', 'line-through']);
  expect(inherited.shot.equals(clean.shot)).toBe(false);
});

for (const style of ['clean', 'hostile', 'inherited', 'themed'] as const) {
  test(`the element changes none of the host page’s own elements: ${style}`, async ({ browser }) => {
    test.slow(true, 'Every computed property of the host’s elements, on two pages.');
    const read = async (withElement: boolean) => {
      const page = await browser.newPage();
      await openIsolation(page, style, withElement);
      const sheets = await page.evaluate(() => ({
        documentSheets: document.styleSheets.length,
        adopted: document.adoptedStyleSheets.length,
        styleElements: document.querySelectorAll('style').length,
      }));
      return { sheets, styles: await styles(page, 'host'), element: await page.locator('fhir-questionnaire').count() };
    };
    const without = await read(false);
    const withElement = await read(true);

    expect([without.element, withElement.element]).toEqual([0, 1]);
    expect(Object.keys(without.styles).length).toBeGreaterThan(5);
    expect(differences(without.styles, withElement.styles)).toEqual([]);
    expect(withElement.sheets).toEqual(without.sheets);
    expect(withElement.sheets.adopted).toBe(0);
  });
}

/** What the themed page sets, read from the form: defaults on a clean page, the host's values on the themed one. */
async function themed(page: Page, style: 'clean' | 'themed') {
  await openIsolation(page, style, true);
  return page.evaluate(() => {
    const root = document.querySelector('fhir-questionnaire')?.shadowRoot;
    const read = (selector: string) => {
      const target = root?.querySelector(selector);
      return target === null || target === undefined ? null : getComputedStyle(target);
    };
    return {
      borderColor: read('.fhirq-control')?.borderTopColor,
      radius: read('.fhirq-control')?.borderTopLeftRadius,
      labelWeight: read('.fhirq-label')?.fontWeight,
      labelDecoration: read('.fhirq-label')?.textDecorationLine,
      addSpacing: read('.fhirq-add')?.letterSpacing,
    };
  });
}

test('tokens set on the element reach inside, and ::part() rules apply', async ({ page }) => {
  expect(await themed(page, 'clean')).toEqual({
    borderColor: 'rgb(92, 95, 102)',
    radius: '4px',
    labelWeight: '600',
    labelDecoration: 'none',
    addSpacing: 'normal',
  });
  expect(await themed(page, 'themed')).toEqual({
    borderColor: 'rgb(1, 2, 3)',
    radius: '7px',
    labelWeight: '800',
    labelDecoration: 'underline',
    addSpacing: '3px',
  });
});

/**
 * FINDING, for the themes (M8), and a contradiction to raise: ADR-0014 says
 * tokens inherit "from the host element or any ancestor", and
 * `default.css` that a token set on any ancestor wins. In the element it
 * does not: the embedded preset sets every token on `:host`, and a value on
 * the element itself hides one inherited from above it. Expected to fail
 * until M8 settles which is right; it then fails the other way and has to
 * be looked at.
 */
test('a token set on an ancestor of the element reaches inside, as ADR-0014 says', async ({ page }) => {
  test.fail(true, 'M8: the preset’s `:host` defaults hide a token set on an ancestor (ADR-0014).');
  await openIsolation(page, 'themed', true);
  const error = await page.evaluate(() => {
    const required = document.querySelector('fhir-questionnaire')?.shadowRoot?.querySelector('.fhirq-required');
    return required === null || required === undefined ? null : getComputedStyle(required).color;
  });
  expect(error).toBe('rgb(4, 5, 6)');
});

/**
 * The `part` names `08-dom-contract.md` documents: each table's `part`
 * column, each `part="…"` in its prose, and, by §1's rule that a class
 * `fhirq-<stem>` has the part `<stem>`, the stem of each class it names.
 */
function documentedParts(): string[] {
  const doc = readFileSync(new URL('../../docs/08-dom-contract.md', import.meta.url), 'utf8');
  const names = new Set<string>();
  const add = (text: string) => {
    for (const name of text.split(/[\s>]+/)) if (name !== '') names.add(name.replace(/^fhirq-/, ''));
  };
  const code = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
  let columns: string[] = [];
  for (const line of doc.split('\n')) {
    if (!line.startsWith('|')) {
      columns = [];
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (columns.length === 0) {
      columns = cells;
      continue;
    }
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    cells.forEach((cell, index) => {
      if (columns[index] === '`part`' || columns[index] === 'Class') code(cell).filter((text) => /^(fhirq-)?[a-z][a-z- >]*$/.test(text)).forEach(add);
    });
  }
  for (const [, parts = ''] of doc.matchAll(/part="([^"]+)"/g)) add(parts);
  for (const [, stem = ''] of doc.matchAll(/\.fhirq-([a-z][a-z-]*)/g)) add(stem);
  return [...names].sort();
}

/** Every `part` name drawn in the element, and each element whose parts are not its classes' stems (§1). */
function drawnParts(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('fhir-questionnaire')?.shadowRoot;
    const names = new Set<string>();
    const unmatched: string[] = [];
    for (const element of root?.querySelectorAll('[part]') ?? []) {
      const parts = (element.getAttribute('part') ?? '').split(' ');
      parts.forEach((name) => names.add(name));
      const stems = [...element.classList].map((name) => name.replace(/^fhirq-/, ''));
      if (parts.join(' ') !== stems.join(' ')) unmatched.push(`${element.tagName.toLowerCase()}: part "${parts.join(' ')}", class "${element.className}"`);
    }
    return { names: [...names].sort(), unmatched };
  });
}

test('every documented part is drawn on the demo or the page of every kind, and nothing else is', async ({ page }) => {
  const documented = documentedParts();
  expect(documented.length).toBeGreaterThan(30);
  const drawn = new Set<string>();
  const unmatched: string[] = [];
  const collect = async () => {
    const found = await drawnParts(page);
    found.names.forEach((name) => drawn.add(name));
    unmatched.push(...found.unmatched);
  };

  for (const form of ['demo', 'kinds'] as const) {
    await open(page, 'element', form);
    await collect();
    await reachState(page, 'refused');
    await collect();
  }
  // The kinds page's repeat allows two instances: at the second, the add
  // control is inert and gives its reason.
  await page.locator('[data-path="meds"] > .fhirq-add').click();
  await page.locator('[data-path="meds"] > .fhirq-reason').waitFor();
  await collect();

  expect(unmatched).toEqual([]);
  expect({ missing: documented.filter((name) => !drawn.has(name)), undocumented: [...drawn].filter((name) => !documented.includes(name)) }).toEqual({ missing: [], undocumented: [] });
});
