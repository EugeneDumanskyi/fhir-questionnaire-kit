import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { EMBED, ORIGIN, open, serve } from './pages/serve.js';

/**
 * M7 AC-6, AC-09.3.1: the element survives being removed and re-inserted,
 * 100 times, and then an HTMX-style swap that moves it into new content and
 * drops its old parent. Afterwards the page holds as many listeners as
 * before, the answers are unchanged, and each keystroke still makes one
 * cycle and one `fhirq-change`: a session subscribed twice adds no DOM
 * listener, so it is caught there.
 *
 * Listeners are counted two ways:
 *
 * - instrumented, in every engine: `addEventListener` and
 *   `removeEventListener` are wrapped before any page script runs, and a
 *   listener's `signal` taking it away is followed;
 * - in Chromium, also by CDP: `DOMDebugger.getEventListeners` over the
 *   window and the whole document, shadow roots included, and
 *   `Memory.getDOMCounters`' live JS listener count.
 *
 * Chromium also counts DOM nodes that are kept alive while detached, after a
 * forced garbage collection (`DOM.getDetachedDomNodes`, and the nodes in
 * `Memory.getDOMCounters`). The control tests leak one listener, or one
 * detached node, per connection, and every counter must read the 100.
 *
 * Run on the element's demo page, whose host sets `session`, and on the
 * script-tag embed, whose element makes its session from `src` and must not
 * load it again.
 */

const CYCLES = 100;

/** Installed before any page script: `window.listening()` is the page's live listeners, in its main world. */
function instrument(): void {
  // Taken unbound, to be called on each target in turn.
  const add = Reflect.get(EventTarget.prototype, 'addEventListener');
  const remove = Reflect.get(EventTarget.prototype, 'removeEventListener');
  /** Per target, the listeners live per type and capture flag, as the platform keys them. */
  const live = new WeakMap<EventTarget, Map<string, Set<unknown>>>();
  let count = 0;
  const key = (type: string, options: boolean | EventListenerOptions | undefined) =>
    `${type} ${String(typeof options === 'boolean' ? options : options?.capture === true)}`;
  const drop = (target: EventTarget, at: string, listener: unknown) => {
    if (live.get(target)?.get(at)?.delete(listener) === true) count -= 1;
  };
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    add.call(this, type, listener, options);
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (listener === null || signal?.aborted === true) return;
    const at = key(type, options);
    const byKey = live.get(this) ?? new Map<string, Set<unknown>>();
    live.set(this, byKey);
    const set = byKey.get(at) ?? new Set<unknown>();
    byKey.set(at, set);
    if (set.has(listener)) return;
    set.add(listener);
    count += 1;
    if (signal !== undefined) add.call(signal, 'abort', () => drop(this, at, listener), { once: true });
    // A `once` listener goes when it first runs: a second one, added after it, runs just after it.
    if (typeof options === 'object' && options.once === true) add.call(this, type, () => drop(this, at, listener), { once: true, capture: options.capture === true });
  };
  EventTarget.prototype.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    remove.call(this, type, listener, options);
    drop(this, key(type, options), listener);
  };
  Object.assign(window, { listening: () => count });
}

interface Counts {
  /** Instrumented, every engine. */
  readonly listening: number;
  /** Chromium: `DOMDebugger.getEventListeners` over the window and the document, piercing shadow roots. */
  readonly cdp?: number;
  /** Chromium: `Memory.getDOMCounters`, after a forced garbage collection. */
  readonly jsEventListeners?: number;
  readonly nodes?: number;
  /** Chromium: nodes kept alive while detached, after a forced garbage collection. */
  readonly detached?: number;
}

/** CDP, where the engine has it. */
async function devtools(page: Page, browserName: string): Promise<CDPSession | null> {
  return browserName === 'chromium' ? page.context().newCDPSession(page) : null;
}

async function counts(page: Page, cdp: CDPSession | null): Promise<Counts> {
  const listening = await page.evaluate(() => (window as unknown as { listening(): number }).listening());
  if (cdp === null) return { listening };
  await cdp.send('HeapProfiler.collectGarbage');
  let listeners = 0;
  for (const expression of ['window', 'document']) {
    const { result } = await cdp.send('Runtime.evaluate', { expression });
    if (result.objectId === undefined) throw new Error(`No ${expression}`);
    listeners += (await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, depth: -1, pierce: true })).listeners.length;
    await cdp.send('Runtime.releaseObject', { objectId: result.objectId });
  }
  const { jsEventListeners, nodes } = await cdp.send('Memory.getDOMCounters');
  const { detachedNodes } = await cdp.send('DOM.getDetachedDomNodes');
  const detached = new Set(detachedNodes.flatMap(({ retainedNodeIds }) => retainedNodeIds)).size;
  return { listening, cdp: listeners, jsEventListeners, nodes, detached };
}

/**
 * Removes the element and puts it back in its place `times` times, a task
 * apart, then moves it into new content and drops its old parent, the way an
 * HTMX swap that preserves it does.
 */
async function reconnect(page: Page, times: number, tag = 'fhir-questionnaire'): Promise<void> {
  await page.evaluate(async ([count, name]) => {
    const element = document.querySelector(name);
    const parent = element?.parentNode;
    if (element === null || parent === null || parent === undefined) throw new Error('No element');
    const next = element.nextSibling;
    const task = () => new Promise((resolve) => setTimeout(resolve));
    for (let n = 0; n < count; n += 1) {
      element.remove();
      await task();
      parent.insertBefore(element, next);
      await task();
    }
    // The swap: the new content arrives, the element moves into it, and the old content goes.
    const swapped = document.createElement('section');
    document.body.append(swapped);
    swapped.append(element);
    if (parent instanceof Element) parent.remove();
    await task();
  }, [times, tag] as const);
  await expect(page.locator(`section > ${tag}`)).toHaveCount(1);
}

/** What the form holds: the session's answers by path, and each control's value and state in the shadow root. */
function answers(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    type Element = HTMLElement & { session: { getSnapshot(): { nodes: readonly { path: string; answers: readonly unknown[] }[] } } | null };
    const element = document.querySelector<Element>('fhir-questionnaire');
    const controls = [...(element?.shadowRoot?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select') ?? [])];
    return {
      session: element?.session?.getSnapshot().nodes.map(({ path, answers: given }) => [path, given]),
      controls: controls.map((control) => [control.id, control.value, control instanceof HTMLInputElement ? control.checked : null]),
    };
  });
}

/** Counts the cycles the session runs and the `fhirq-change` events the host is handed, from now. */
async function listen(page: Page): Promise<() => Promise<{ cycles: number; changes: number }>> {
  await page.evaluate(() => {
    const element = document.querySelector<HTMLElement & { session: { getSnapshot(): { cycle: number } } }>('fhir-questionnaire');
    const seen = { from: element?.session.getSnapshot().cycle ?? 0, changes: 0 };
    element?.addEventListener('fhirq-change', () => {
      seen.changes += 1;
    });
    Object.assign(window, { seen });
  });
  return () =>
    page.evaluate(() => {
      const element = document.querySelector<HTMLElement & { session: { getSnapshot(): { cycle: number } } }>('fhir-questionnaire');
      const { seen } = window as unknown as { seen: { from: number; changes: number } };
      return { cycles: (element?.session.getSnapshot().cycle ?? 0) - seen.from, changes: seen.changes };
    });
}

/** Answers a few of the demo's questions: text, a boolean, the integer it shows, and a repeating group's first entry. */
async function answer(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: 'What is the main reason for your visit?' }).fill('A sore knee');
  await page.getByRole('radiogroup', { name: 'Are you in pain today?' }).getByRole('radio', { name: 'Yes' }).check();
  await page.getByRole('textbox', { name: /how strong is it\?$/ }).fill('7');
  await page.getByRole('textbox', { name: 'Name of the medicine' }).fill('Ibuprofen');
}

/** The control tests' element: the kit's, with one leak on each connection or disconnection. */
const LEAKY = 'leaky-questionnaire';

/**
 * Puts a leaky element in the kit's element's place, on its session. A
 * subclass under a tag of its own, since the platform reads an element's
 * callbacks once, when it is defined.
 */
async function leaky(page: Page, on: 'connect' | 'disconnect'): Promise<void> {
  await page.evaluate(
    ([tag, when]) => {
      type Kit = HTMLElement & { session: unknown; connectedCallback(): void; disconnectedCallback(): void };
      const Base = customElements.get('fhir-questionnaire') as unknown as new () => Kit;
      const kept: Node[] = [];
      customElements.define(
        tag,
        class extends Base {
          override connectedCallback(): void {
            super.connectedCallback();
            if (when === 'connect') this.shadowRoot?.addEventListener('input', () => undefined);
          }

          override disconnectedCallback(): void {
            super.disconnectedCallback();
            if (when !== 'disconnect') return;
            const node = document.createElement('div');
            this.shadowRoot?.append(node);
            node.remove();
            kept.push(node);
          }
        },
      );
      const kit = document.querySelector<Kit>('fhir-questionnaire');
      const element = document.createElement(tag) as Kit;
      element.session = kit?.session ?? null;
      kit?.replaceWith(element);
    },
    [LEAKY, on] as const,
  );
  await expect(page.locator(LEAKY).getByRole('radiogroup', { name: 'Are you in pain today?' })).toBeVisible();
}

const PAGES = {
  "the host's session": (page: Page) => open(page, 'element', 'demo'),
  'a session made from src': async (page: Page) => {
    await serve(page);
    await page.goto(`${ORIGIN}${EMBED}`);
    await expect(page.getByRole('radiogroup', { name: 'Are you in pain today?' })).toBeVisible();
  },
} as const;

for (const [name, visit] of Object.entries(PAGES)) {
  test.describe(`reconnecting, with ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(instrument);
      await visit(page);
      await answer(page);
    });

    test(`${String(CYCLES)} reconnections and a swap add no listener, keep no node, and change no answer`, async ({ page, browserName }) => {
      const loads: string[] = [];
      page.on('request', (request) => loads.push(new URL(request.url()).pathname));
      const cdp = await devtools(page, browserName);
      const before = { counts: await counts(page, cdp), answers: await answers(page) };

      await reconnect(page, CYCLES);

      // The swap drops the old parent and its own nodes, so the document may hold fewer.
      const { nodes, ...after } = await counts(page, cdp);
      const { nodes: held, ...counted } = before.counts;
      expect(after).toEqual(counted);
      expect(nodes ?? 0).toBeLessThanOrEqual(held ?? 0);
      expect(await answers(page)).toEqual(before.answers);
      // The form still answers, once per keystroke.
      const seen = await listen(page);
      await page.getByRole('textbox', { name: 'What is the main reason for your visit?' }).press('End');
      await page.keyboard.type('!');
      await expect(page.getByRole('textbox', { name: 'What is the main reason for your visit?' })).toHaveValue('A sore knee!');
      expect(await seen()).toEqual({ cycles: 1, changes: 1 });
      // A session the element made is kept: its form is not loaded again.
      expect(loads).toEqual([]);
    });

    test('control: every counter reads a listener leaked on each connection', async ({ page, browserName }) => {
      const cdp = await devtools(page, browserName);
      await leaky(page, 'connect');
      const before = await counts(page, cdp);

      await reconnect(page, CYCLES, LEAKY);

      // The swap connects the element once more.
      const leaked = CYCLES + 1;
      const after = await counts(page, cdp);
      expect(after.listening - before.listening).toBe(leaked);
      if (cdp !== null) {
        expect((after.cdp ?? 0) - (before.cdp ?? 0)).toBe(leaked);
        expect((after.jsEventListeners ?? 0) - (before.jsEventListeners ?? 0)).toBe(leaked);
      }
    });

    test('control: Chromium reads a node kept alive after each disconnection', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'Detached nodes are counted through CDP.');
      const cdp = await devtools(page, browserName);
      await leaky(page, 'disconnect');
      const before = await counts(page, cdp);

      await reconnect(page, CYCLES, LEAKY);

      // The swap disconnects the element once more.
      const after = await counts(page, cdp);
      expect((after.detached ?? 0) - (before.detached ?? 0)).toBe(CYCLES + 1);
      expect(after.nodes ?? 0).toBeGreaterThan(before.nodes ?? 0);
    });
  });
}
