import { expect, test, type Locator, type Page } from '@playwright/test';

import { MATRIX_FORMS, type MatrixForm } from './pages/names.js';
import { openMatrix, reachState, STATES, type State } from './states.js';

/**
 * M8 AC-6, NFR-I-05: the form under `dir="rtl"` is the form under `ltr`
 * mirrored (plan D5). The default theme (tier 1) on the demo and the form of
 * every kind, in both renderers, in each state of the axe matrix, in every
 * engine:
 *
 * - geometry: every part's box, measured from the form's own box, lands where
 *   mirroring its `ltr` box across the form's inline axis puts it, and keeps
 *   its size;
 * - the ARIA snapshot: what assistive technology reads is the same in both
 *   directions, so direction changes only where things are drawn.
 *
 * The page sets `dir` on its root, as a host does, and the element inherits
 * it through the shadow boundary. No binary baselines: the mirror is the
 * snapshot, so the check holds on any OS and needs no regeneration.
 *
 * Two things the theme does not place are left out or allowed for. Inline
 * text runs are placed by the Unicode bidi algorithm: an authored `<b>About</b>
 * you` stays in reading order inside a right-to-left line. And WebKit draws
 * a text input with no set width narrower under `rtl`, by 2 px with no style
 * at all; the check measures that drift on a bare input and allows two of it,
 * one each for a quantity row's value and unit.
 */

type Renderer = 'element' | 'react';
const RENDERERS: readonly Renderer[] = ['element', 'react'];
const FORM: Readonly<Record<Renderer, string>> = { element: 'fhir-questionnaire .fhirq-form', react: '#root .fhirq-form' };

/** Box edges are fractional, and engines round them to the pixel differently by direction. */
const TOLERANCE = 1;

type Box = { where: string; left: number; right: number; top: number; bottom: number; direction: string };

/** How much narrower the engine draws a bare text input under `rtl` than under `ltr`. */
function drift(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bare = document.createElement('input');
    document.body.append(bare);
    const width = (dir: string) => {
      document.documentElement.dir = dir;
      return bare.getBoundingClientRect().width;
    };
    const measured = width('ltr') - width('rtl');
    bare.remove();
    return measured;
  });
}

/** Every drawn part of the form, keyed by its place in the tree, as offsets from the form's own box. */
function boxes(form: Locator): Promise<Box[]> {
  return form.evaluate((root) => {
    const frame = root.getBoundingClientRect();
    const name = (element: Element): string => {
      const parent = element.parentElement;
      const at = parent === null || element === root ? '' : `${name(parent)} > `;
      const index = parent === null ? 0 : [...parent.children].indexOf(element);
      return `${at}${element.localName}${element.classList.length > 0 ? `.${[...element.classList].join('.')}` : ''}:${String(index)}`;
    };
    return [root, ...root.querySelectorAll('*')].flatMap((element) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || getComputedStyle(element).display === 'inline') return [];
      return [
        {
          where: name(element),
          left: box.left - frame.left,
          right: frame.right - box.right,
          top: box.top - frame.top,
          bottom: frame.bottom - box.bottom,
          direction: getComputedStyle(element).direction,
        },
      ];
    });
  });
}

/**
 * Each part of `rtl` whose box is not `ltr`'s mirrored: its inline edges
 * swapped, within the engine's `drift` twice over, and its block edges kept.
 */
function unmirrored(ltr: readonly Box[], rtl: readonly Box[], drift = 0): string[] {
  const mirrored = new Map(rtl.map((box) => [box.where, box]));
  const off = (x: number, y: number, slack = 0) => Math.abs(x - y) > TOLERANCE + slack;
  return ltr.flatMap((box) => {
    const other = mirrored.get(box.where);
    if (other === undefined) return [`${box.where}: not drawn in rtl`];
    const faults = [
      off(box.left, other.right, 2 * drift) || off(box.right, other.left, 2 * drift) ? `inline ${box.left.toFixed(1)}…${box.right.toFixed(1)} became ${other.left.toFixed(1)}…${other.right.toFixed(1)}` : '',
      off(box.top, other.top) || off(box.bottom, other.bottom) ? `block ${box.top.toFixed(1)}…${box.bottom.toFixed(1)} became ${other.top.toFixed(1)}…${other.bottom.toFixed(1)}` : '',
    ].filter((fault) => fault !== '');
    return faults.length === 0 ? [] : [`${box.where}: ${faults.join(', ')}`];
  });
}

/** The ARIA snapshot, with generated fragment ids made neutral, as the DOM contract compares them. */
const aria = async (form: Locator) => (await form.ariaSnapshot()).replace(/\/url: "#[^"]*"/g, '/url: "#<id>"');

const direct = (page: Page, dir: 'ltr' | 'rtl') =>
  page.evaluate((value) => {
    document.documentElement.dir = value;
  }, dir);

async function opened(page: Page, renderer: Renderer, form: MatrixForm, state: State): Promise<Locator> {
  await openMatrix(page, renderer, 1, form);
  await reachState(page, form, state);
  return page.locator(FORM[renderer]);
}

for (const renderer of RENDERERS)
  for (const form of MATRIX_FORMS)
    for (const state of STATES)
      test(`rtl: ${renderer}, ${form}, ${state}: mirrored, and read the same`, async ({ page }) => {
        const found = await opened(page, renderer, form, state);
        const slack = await drift(page);
        await direct(page, 'ltr');
        const ltr = await boxes(found);
        const read = await aria(found);

        await direct(page, 'rtl');
        const rtl = await boxes(found);

        expect(rtl.every(({ direction }) => direction === 'rtl'), 'every part lays out right to left').toBe(true);
        const before = new Map(ltr.map((box) => [box.where, box.left]));
        const moved = rtl.filter((box) => Math.abs(box.left - (before.get(box.where) ?? box.left)) > TOLERANCE);
        expect(moved.length, 'parts that moved: the check is not vacuous').toBeGreaterThan(0);
        expect(slack, 'the engine\'s own drift stays small, or it would hide a fault').toBeLessThanOrEqual(2);
        expect(unmirrored(ltr, rtl, slack)).toEqual([]);
        expect(await aria(found)).toBe(read);
      });

test('control: the mirror check sees a physical property inside the shadow root', async ({ page }) => {
  const found = await opened(page, 'element', 'demo', 'loaded');
  await found.evaluate((root) => {
    const shadow = root.getRootNode() as ShadowRoot;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.fhirq-add { margin-left: 2rem }');
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
  });
  const slack = await drift(page);
  await direct(page, 'ltr');
  const ltr = await boxes(found);
  await direct(page, 'rtl');

  expect(unmirrored(ltr, await boxes(found), slack)).toContainEqual(expect.stringMatching(/button\.fhirq-add:\d+: inline /));
});
