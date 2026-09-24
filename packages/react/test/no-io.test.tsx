import type { ControlProps } from '@fhirq/core/view';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { lock, type Doors } from '../../core/test/safety/doors.js';
import { FORMATS, FORMATS_OPTIONS, FORMATS_VALUE } from './formats.js';
import { KINDS, KINDS_OPTIONS } from './kinds.js';

/**
 * AC-14.6.1, NFR-X-01, NFR-X-02 for `@fhirq/react` on a server (M6 plan
 * step 8): with every door out of the process locked, the entry point loads
 * and renders every control kind and every option a host can pass, and not
 * one door is touched. The client half, effects and handlers included, runs
 * in Chromium (`browser/no-io.test.tsx`).
 */

let locked: Doors;
const restore: (() => void)[] = [];

beforeAll(() => {
  // Node has no `document` and no `sendBeacon`: stand-ins carry the doors instead.
  for (const name of ['navigator', 'document']) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: {} });
    restore.push(() => {
      if (before === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, before);
    });
  }
  const { navigator, document } = globalThis as unknown as { navigator: object; document: object };
  locked = lock(globalThis, navigator, document);
});

afterAll(() => {
  locked.unlock();
  for (const undo of restore.reverse()) undo();
});

function DateInput({ node, ids }: ControlProps<'calendar-date'>): ReactElement {
  return <input id={ids.control} aria-invalid={node.invalid} readOnly value={node.entry} />;
}

describe('no network, no storage, no telemetry on the server (AC-14.6.1, NFR-X-01, NFR-X-02)', () => {
  it('loads @fhirq/react and renders every kind and every option, touching no door', async () => {
    const { Questionnaire } = await import('@fhirq/react');
    const resolver = vi.fn(() => Promise.resolve([{ code: 'a', display: 'A' }]));
    const handlers = { onChange: vi.fn(), onComplete: vi.fn(), onDiagnostic: vi.fn() };

    const html = [
      renderToString(
        <Questionnaire
          questionnaire={KINDS}
          options={{ ...KINDS_OPTIONS, resolver }}
          controls={{ 'calendar-date': DateInput }}
          locale="de"
          timeZone="Europe/Berlin"
          messages={{ yes: 'Ja' }}
          {...handlers}
        />,
      ),
      renderToString(<Questionnaire questionnaire={FORMATS} value={FORMATS_VALUE} options={FORMATS_OPTIONS} {...handlers} />),
    ];

    expect(html.every((markup) => markup.includes('class="fhirq-form"'))).toBe(true);
    expect(resolver).not.toHaveBeenCalled();
    expect(locked.touched).toEqual([]);
  });
});
