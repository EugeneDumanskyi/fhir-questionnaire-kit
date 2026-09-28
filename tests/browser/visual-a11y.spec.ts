import { expect, test, type Locator, type Page } from '@playwright/test';

import { MATRIX_FORMS, type MatrixForm } from './pages/names.js';
import { openMatrix, reachState, STATES, type State } from './states.js';

/**
 * M8 AC-4 and AC-5 (NFR-A-03…06), read from what each engine draws rather
 * than from the tokens (`packages/themes/test/stylesheets.test.ts` holds the
 * preset's pairs). The default theme (tier 1) on the demo and the form of
 * every kind, in both renderers, in each state of the axe matrix:
 *
 * - contrast: every text 4.5:1, or 3:1 when large; every control's boundary,
 *   error bar and radio or checkbox accent 3:1 against what it sits on,
 *   light and dark (1.4.3, 1.4.11);
 * - focus: every focusable part shows an outline at least 2 px wide and 3:1
 *   against what it sits on, light, dark, and in forced colours, which only
 *   Chromium emulates (2.4.7, NFR-A-04);
 * - targets: every target at least 24 px square or clear of its neighbours by
 *   WCAG's spacing exception, and the primary controls of plan D8 at least
 *   44 px square (2.5.8, NFR-A-05);
 * - reflow: no horizontal scroll and no part past the viewport at 320 by 256
 *   CSS px, which is what a 1280 by 1024 screen at 400 % gives: browsers zoom
 *   by shrinking the CSS viewport, and Playwright has no zoom of its own
 *   (1.4.10, NFR-A-06);
 * - motion: no transition or animation on any part, with reduced motion and
 *   without, and a control that the check sees an animation in the shadow
 *   root (2.3.3).
 */

type Renderer = 'element' | 'react';
const RENDERERS: readonly Renderer[] = ['element', 'react'];
const FORM: Readonly<Record<Renderer, string>> = { element: 'fhir-questionnaire .fhirq-form', react: '#root .fhirq-form' };

/** Plan D8: text entries, selects, whole choice rows and the add, remove and retry buttons. */
const PRIMARY = '.fhirq-control, .fhirq-unit, .fhirq-other-text, .fhirq-choice, .fhirq-other, .fhirq-add, .fhirq-remove, .fhirq-retry';
const TARGETS = `a[href], button, input, select, textarea, label.fhirq-choice, label.fhirq-other`;
/** The parts whose border is what shows the control's extent. */
const BOUNDED = '.fhirq-control, .fhirq-unit, .fhirq-other-text, .fhirq-add, .fhirq-remove, .fhirq-retry';

async function opened(page: Page, renderer: Renderer, form: MatrixForm, state: State): Promise<Locator> {
  await openMatrix(page, renderer, 1, form);
  await reachState(page, form, state);
  return page.locator(FORM[renderer]);
}

/* Colour, as a computed style prints it, and WCAG 2.2's contrast ratio. */

type Rgba = readonly [r: number, g: number, b: number, a: number];

function parse(colour: string): Rgba {
  const match = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(colour);
  if (match === null) throw new Error(`Not an sRGB colour: ${colour}`);
  const [, r = '0', g = '0', b = '0', a = '1'] = match;
  return [Number(r), Number(g), Number(b), Number(a)];
}

/** `top` over `bottom`, which is opaque. */
const over = (top: Rgba, bottom: Rgba): Rgba => [0, 1, 2].map((at) => (top[at] ?? 0) * top[3] + (bottom[at] ?? 0) * (1 - top[3])).concat(1) as unknown as Rgba;

/** What shows through a stack of backgrounds, nearest first: the nearest opaque one, with those above it laid over it. */
function behind(backgrounds: readonly string[]): Rgba {
  const layers = backgrounds.map(parse);
  const opaque = layers.findIndex((layer) => layer[3] === 1);
  if (opaque === -1) throw new Error('No opaque background under the form');
  return layers.slice(0, opaque).reduceRight<Rgba>((under, layer) => over(layer, under), layers[opaque] ?? [0, 0, 0, 1]);
}

const luminance = ([r, g, b]: Rgba) => {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

function contrast(foreground: string, backgrounds: readonly string[]): number {
  const ground = behind(backgrounds);
  const [high, low] = [luminance(over(parse(foreground), ground)), luminance(ground)].sort((x, y) => y - x);
  return Math.round((((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)) * 100) / 100;
}

/* What the page draws, read inside it. Each callback stands alone, as `evaluate` sends it to the page. */

interface Drawn {
  readonly where: string;
  readonly colour: string;
  readonly backgrounds: readonly string[];
  readonly minimum: number;
}

/** Every visible text, with its colour and the backgrounds under it; then each boundary, error bar and accent, with the backgrounds on either side. */
function drawn(form: Locator): Promise<Drawn[]> {
  return form.evaluate(
    (root, bounded) => {
      const name = (element: Element) => `${element.tagName.toLowerCase()}${[...element.classList].map((token) => `.${token}`).join('')}`;
      const up = (element: Element): Element | null => element.parentElement ?? (element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).host : null);
      const backgrounds = (element: Element | null) => {
        const found: string[] = [];
        for (let at = element; at !== null; at = up(at)) found.push(getComputedStyle(at).backgroundColor);
        return found;
      };
      const shown = (element: Element) => {
        const box = element.getBoundingClientRect();
        return element.checkVisibility() && box.width > 1 && box.height > 1;
      };
      const pairs: { where: string; colour: string; backgrounds: string[]; minimum: number }[] = [];
      for (const element of [root, ...root.querySelectorAll('*')]) {
        if (!shown(element)) continue;
        const style = getComputedStyle(element);
        const field = element.matches('input:not([type="radio"], [type="checkbox"]), select, textarea');
        const text = [...element.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim() !== '');
        if (field || text) {
          const size = parseFloat(style.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
          pairs.push({ where: `${name(element)} text`, colour: style.color, backgrounds: backgrounds(element), minimum: large ? 3 : 4.5 });
        }
        if (element.matches(bounded) || element.matches('.fhirq-summary')) {
          pairs.push({ where: `${name(element)} border, outside`, colour: style.borderTopColor, backgrounds: backgrounds(up(element)), minimum: 3 });
          pairs.push({ where: `${name(element)} border, inside`, colour: style.borderTopColor, backgrounds: backgrounds(element), minimum: 3 });
        }
        if (element.matches('[aria-invalid="true"]') && parseFloat(style.borderLeftWidth) > 0)
          pairs.push({ where: `${name(element)} error bar`, colour: style.borderLeftColor, backgrounds: backgrounds(up(element)), minimum: 3 });
        if (element.matches('.fhirq-radio, .fhirq-checkbox'))
          pairs.push({ where: `${name(element)} accent`, colour: style.accentColor, backgrounds: backgrounds(up(element)), minimum: 3 });
      }
      return pairs;
    },
    BOUNDED,
  );
}

interface Ring {
  readonly where: string;
  readonly focused: boolean;
  readonly visible: boolean;
  readonly style: string;
  readonly width: number;
  readonly colour: string;
  readonly backgrounds: readonly string[];
}

/**
 * Focuses every focusable part in turn and reads its outline. The caller
 * presses a key first, so programmatic focus is keyboard focus to each
 * engine's `:focus-visible` (it follows the last input), the way Tab and the
 * arrow keys reach every part, radios that are not the group's stop too.
 */
function rings(form: Locator): Promise<Ring[]> {
  return form.evaluate((root) => {
    const up = (element: Element): Element | null => element.parentElement ?? (element.getRootNode() instanceof ShadowRoot ? (element.getRootNode() as ShadowRoot).host : null);
    const backgrounds = (element: Element | null) => {
      const found: string[] = [];
      for (let at = element; at !== null; at = up(at)) found.push(getComputedStyle(at).backgroundColor);
      return found;
    };
    const focusable = [...root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
      (element) => element.checkVisibility() && !element.matches(':disabled'),
    );
    return focusable.map((element) => {
      element.focus();
      const style = getComputedStyle(element);
      return {
        where: `${element.tagName.toLowerCase()}${[...element.classList].map((token) => `.${token}`).join('')}`,
        focused: (element.getRootNode() as Document | ShadowRoot).activeElement === element,
        visible: element.matches(':focus-visible'),
        style: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
        colour: style.outlineColor,
        backgrounds: backgrounds(up(element)),
      };
    });
  });
}

/** The focus ring's gate on every part: focused, drawn, 2 px, and 3:1 against what it sits on. */
function faults(found: readonly Ring[]): string[] {
  return found.flatMap((ring) => {
    const ratio = contrast(ring.colour, ring.backgrounds);
    if (!ring.focused || !ring.visible) return [`${ring.where}: not keyboard-focused`];
    if (ring.style === 'none' || ring.width < 2) return [`${ring.where}: outline ${ring.style} ${String(ring.width)} px`];
    return ratio < 3 ? [`${ring.where}: outline ${String(ratio)}:1`] : [];
  });
}

interface Target {
  readonly where: string;
  readonly primary: boolean;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

function targets(form: Locator): Promise<Target[]> {
  return form.evaluate(
    (root, [selector, primary]) =>
      [...root.querySelectorAll(selector)]
        .filter((element) => element.checkVisibility())
        .map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { where: `${element.tagName.toLowerCase()}${[...element.classList].map((token) => `.${token}`).join('')}`, primary: element.matches(primary), box: { x, y, width, height } };
        }),
    [TARGETS, PRIMARY] as const,
  );
}

/** A target's centre, and how far a point is from its box. */
const centre = ({ box }: Target) => [box.x + box.width / 2, box.y + box.height / 2] as const;
const distance = ([px, py]: readonly [number, number], { box }: Target) =>
  Math.hypot(Math.max(box.x - px, 0, px - (box.x + box.width)), Math.max(box.y - py, 0, py - (box.y + box.height)));

/**
 * 2.5.8 and NFR-A-05: a primary control 44 px square; any other target 24 px
 * square, or a 24 px circle on its centre clear of every other target and
 * every other undersized target's circle. Half a pixel is layout rounding.
 * A target inside another (a radio in its choice row) is part of it.
 */
function undersized(found: readonly Target[]): string[] {
  const small = (target: Target, side: number) => target.box.width < side - 0.5 || target.box.height < side - 0.5;
  const inside = (a: Target, b: Target) =>
    a.box.x >= b.box.x - 0.5 && a.box.y >= b.box.y - 0.5 && a.box.x + a.box.width <= b.box.x + b.box.width + 0.5 && a.box.y + a.box.height <= b.box.y + b.box.height + 0.5;
  return found.flatMap((target) => {
    const size = `${target.where} ${String(Math.round(target.box.width))} × ${String(Math.round(target.box.height))} px`;
    if (target.primary) return small(target, 44) ? [`${size}, primary`] : [];
    if (!small(target, 24)) return [];
    const crowded = found.some((other) => {
      if (other === target || inside(target, other) || inside(other, target)) return false;
      return small(other, 24) ? Math.hypot(centre(target)[0] - centre(other)[0], centre(target)[1] - centre(other)[1]) < 24 : distance(centre(target), other) < 12;
    });
    return crowded ? [`${size}, crowded`] : [];
  });
}

/** Each part past the viewport's inline edges, and the page's own horizontal overflow. */
function overflow(form: Locator): Promise<string[]> {
  return form.evaluate((root) => {
    const past = [root, ...root.querySelectorAll('*')]
      .filter((element) => element.checkVisibility() && !element.matches('.fhirq-status'))
      .filter((element) => {
        const { left, right } = element.getBoundingClientRect();
        return left < -0.5 || right > innerWidth + 0.5;
      })
      .map((element) => `${element.tagName.toLowerCase()}${[...element.classList].map((token) => `.${token}`).join('')}`);
    const { scrollWidth, clientWidth } = document.documentElement;
    return scrollWidth > clientWidth ? [`the page scrolls ${String(scrollWidth - clientWidth)} px`, ...past] : past;
  });
}

/** Every animation on or under the form, and each part that would transition or animate. */
function motion(form: Locator): Promise<string[]> {
  return form.evaluate((root) => {
    const moving = (durations: string) => durations.split(',').some((duration) => parseFloat(duration) > 0);
    const parts = [root, ...root.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      return (style.transitionProperty !== 'none' && moving(style.transitionDuration)) || (style.animationName !== 'none' && moving(style.animationDuration));
    });
    return [
      ...root.getAnimations({ subtree: true }).map((animation) => `running: ${animation.constructor.name}`),
      ...parts.map((element) => `${element.tagName.toLowerCase()}${[...element.classList].map((token) => `.${token}`).join('')}`),
    ];
  });
}

for (const renderer of RENDERERS)
  for (const form of MATRIX_FORMS) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`contrast: ${renderer}, ${form}, ${scheme} (NFR-A-03)`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        for (const state of STATES) {
          const pairs = await drawn(await opened(page, renderer, form, state));
          expect(pairs.length, `${state}: pairs read`).toBeGreaterThan(20);
          const low = pairs.map((pair) => ({ ...pair, ratio: contrast(pair.colour, pair.backgrounds) })).filter(({ ratio, minimum }) => ratio < minimum);
          expect(
            low.map(({ where, ratio, minimum }) => `${where} ${String(ratio)}:1 < ${String(minimum)}:1`),
            state,
          ).toEqual([]);
        }
      });

      test(`focus: ${renderer}, ${form}, ${scheme} (NFR-A-04)`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        for (const state of ['answered', 'refused'] as const) {
          const found = await opened(page, renderer, form, state);
          await page.keyboard.press('Shift');
          const read = await rings(found);
          expect(read.length, `${state}: parts focused`).toBeGreaterThan(10);
          expect(faults(read), state).toEqual([]);
        }
      });
    }

    test(`focus in forced colours: ${renderer}, ${form} (NFR-A-04)`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Playwright emulates forced colours in Chromium only (M8 plan step 8)');
      await page.emulateMedia({ forcedColors: 'active' });
      const found = await opened(page, renderer, form, 'refused');
      await page.keyboard.press('Shift');
      const read = await rings(found);
      expect(read.length).toBeGreaterThan(10);
      expect(faults(read)).toEqual([]);
    });

    test(`targets: ${renderer}, ${form} (NFR-A-05)`, async ({ page }) => {
      for (const state of STATES) {
        const found = await targets(await opened(page, renderer, form, state));
        expect(found.filter(({ primary }) => primary).length, `${state}: primary controls`).toBeGreaterThan(5);
        expect(undersized(found), state).toEqual([]);
      }
    });

    test(`reflow at 320 px, or 1280 px at 400 %: ${renderer}, ${form} (NFR-A-06)`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 256 });
      for (const state of STATES) expect(await overflow(await opened(page, renderer, form, state)), state).toEqual([]);
    });

    test(`motion: ${renderer}, ${form} (2.3.3)`, async ({ page }) => {
      for (const reducedMotion of ['reduce', 'no-preference'] as const) {
        await page.emulateMedia({ reducedMotion });
        const found = await opened(page, renderer, form, 'answered');
        await found.locator('.fhirq-add').first().click();
        expect(await motion(found), reducedMotion).toEqual([]);
      }
    });
  }

/**
 * Not vacuous: a sheet adopted into the element's shadow root, after the
 * kit's, removes the focus ring, shrinks the add button and fades its text,
 * and the add button is animated. Each gate reads the fault from the page.
 */
test('control: each gate sees a fault drawn inside the shadow root', async ({ page }) => {
  const found = await opened(page, 'element', 'demo', 'loaded');
  await found.evaluate((root) => {
    const shadow = root.getRootNode() as ShadowRoot;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.fhirq-form :focus-visible { outline: none } .fhirq-add { min-block-size: 0; min-inline-size: 0; padding: 0; color: #c8c8c8 }');
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
    root.querySelector('.fhirq-add')?.animate([{ opacity: 1 }, { opacity: 0.9 }], { duration: 60_000 });
  });

  expect(await motion(found)).toContain('running: Animation');
  expect(undersized(await targets(found))).toContainEqual(expect.stringMatching(/^button\.fhirq-add .*, primary$/));
  const faint = (await drawn(found)).find(({ where }) => where === 'button.fhirq-add text');
  expect(faint && contrast(faint.colour, faint.backgrounds)).toBeLessThan(4.5);
  await page.keyboard.press('Shift');
  const read = await rings(found);
  expect(faults(read)).toHaveLength(read.length);
});
