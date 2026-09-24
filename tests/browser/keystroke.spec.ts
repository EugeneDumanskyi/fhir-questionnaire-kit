import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import type { Typed } from './pages/names.js';
import { openTyped } from './pages/serve.js';

/**
 * M6 AC-10, NFR-P-03: keystroke to painted character, report-only (plan
 * D10). 50 characters are typed into a text item, one every two frames, and
 * Chromium's Event Timing reads each keystroke twice:
 *
 * - paint: the `keydown` entry's duration, from the key to the frame that
 *   paints it, rounded to 8 ms. Entries under 16 ms are never reported, so a
 *   keystroke with none painted within a frame.
 * - script: from the first handler of the keystroke's events (`keydown`,
 *   `keypress`, `beforeinput`, `input`) to the end of the last, at full
 *   precision. React renders inside them, so this is the kit's share.
 *
 * The textarea control has no form behind it: its paint is the browser's own
 * floor. Chromium only, since WebKit has no Event Timing. Production builds,
 * client-rendered, no StrictMode. `pnpm test:keystroke` runs it alone, on one
 * worker; each reading is printed and written to `reports/keystroke/`.
 */

const TEXT = 'Short of breath on stairs since March, worse at ni';
const FIELDS: Readonly<Record<Typed, string>> = {
  control: 'Control',
  demo: 'What is the main reason for your visit?',
  'large-500': 'sec0-1-10',
  'large-500-cloned': 'sec0-1-10',
};
const TYPES = ['keydown', 'keypress', 'beforeinput', 'input'];

interface Timing {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly processingStart: number;
  readonly processingEnd: number;
}

/** Each keystroke's entries: a `keydown` and what followed it. */
function keystrokes(entries: readonly Timing[]): { readonly paint: number; readonly script: number }[] {
  const groups: Timing[][] = [];
  for (const entry of [...entries].sort((a, b) => a.startTime - b.startTime)) {
    if (entry.name === 'keydown') groups.push([entry]);
    else groups.at(-1)?.push(entry);
  }
  return groups.map(([keydown, ...rest]) => ({
    paint: keydown?.duration ?? Number.NaN,
    script: Math.max(...[keydown, ...rest].map((entry) => entry?.processingEnd ?? Number.NaN)) - (keydown?.processingStart ?? Number.NaN),
  }));
}

const percentile = (values: readonly number[], p: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * values.length) - 1)] ?? Number.NaN;
const summary = (values: readonly number[]) => ({ median: percentile(values, 0.5), p95: percentile(values, 0.95), max: percentile(values, 1) });
const ms = ({ median, p95, max }: ReturnType<typeof summary>, digits: number) => `median ${median.toFixed(digits)}, p95 ${p95.toFixed(digits)}, max ${max.toFixed(digits)} ms`;

for (const major of [18, 19] as const) {
  for (const form of ['control', 'demo', 'large-500', 'large-500-cloned'] as const) {
    test(`keystroke to paint: React ${major}, ${form}`, async ({ page }) => {
      await openTyped(page, major, form);
      const field = page.getByRole('textbox', { name: FIELDS[form], exact: true });
      await field.click();
      await page.evaluate((types) => {
        const entries: Timing[] = [];
        const keep = (list: PerformanceEntryList) => {
          for (const { name, startTime, duration, processingStart, processingEnd } of list as PerformanceEventTiming[]) {
            if (types.includes(name)) entries.push({ name, startTime, duration, processingStart, processingEnd });
          }
        };
        const observer = new PerformanceObserver((list) => keep(list.getEntries()));
        observer.observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
        Object.assign(window, { probe: { entries, flush: () => keep(observer.takeRecords()) } });
      }, TYPES);

      const frames = (count: number) =>
        page.evaluate(
          (left) =>
            new Promise<void>((resolve) => {
              const next = (n: number) => (n === 0 ? resolve() : requestAnimationFrame(() => next(n - 1)));
              next(left);
            }),
          count,
        );
      for (const character of TEXT) {
        await page.keyboard.type(character);
        await frames(2);
      }
      // Event Timing reports once the paint is presented.
      await frames(4);
      const entries = await page.evaluate(() => {
        const { probe } = window as unknown as { probe: { entries: Timing[]; flush: () => void } };
        probe.flush();
        return probe.entries;
      });

      await expect(field).toHaveValue(TEXT);
      // Every keystroke is a cycle: the cloning host is handed a response for each.
      if (form === 'large-500-cloned') {
        expect(await page.evaluate(() => (window as unknown as { fhirq: { seen: { changes: number } } }).fhirq.seen.changes)).toBe(TEXT.length);
      }
      const timed = keystrokes(entries);
      const reading = {
        react: major,
        form,
        keystrokes: TEXT.length,
        reported: timed.length,
        paint: summary(timed.map(({ paint }) => paint)),
        script: summary(timed.map(({ script }) => script)),
      };
      mkdirSync('reports/keystroke', { recursive: true });
      writeFileSync(`reports/keystroke/react-${major}-${form}.json`, `${JSON.stringify(reading, null, 2)}\n`);
      console.log(
        `keystroke to paint, React ${major}, ${form}: ${reading.reported} of ${reading.keystrokes} at 16 ms or more; ` +
          `paint ${ms(reading.paint, 0)}; script ${ms(reading.script, 1)}`,
      );
    });
  }
}
