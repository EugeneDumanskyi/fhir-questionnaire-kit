import { readFileSync } from 'node:fs';

import { createSession, type Questionnaire as Form } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { version } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AMOUNT, bool, SLICE, SMOKER } from '../../core/test/slice.js';
import { FORMATS, FORMATS_OPTIONS, FORMATS_VALUE, refused } from './formats.js';
import { KINDS, KINDS_OPTIONS } from './kinds.js';
import { COLOURS, Probe } from './probe.js';

/**
 * AC-6's Node half (M1): server rendering needs no DOM. This file runs twice,
 * once per React major: the `react` project resolves React 19 from this
 * package, `react-18` resolves React 18 from tools/react-18 (vitest.config.ts).
 * Hydration without warnings is the browser half (tests/browser/hydration).
 */
const DEMO = JSON.parse(readFileSync(new URL('../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8')) as Form;

/** ADR-0020's pair: 26 hours apart, so a date that passed through either zone would land on another day. */
const ZONES = ['Pacific/Kiritimati', 'Etc/GMT+12'] as const;

/** Renders `render()` with the process in each zone in turn; Node applies a new `TZ` at once. */
function inEachZone(render: () => string): { readonly offsets: readonly number[]; readonly html: readonly string[] } {
  const before = process.env['TZ'];
  try {
    return ZONES.reduce<{ offsets: number[]; html: string[] }>(
      (seen, zone) => {
        process.env['TZ'] = zone;
        return { offsets: [...seen.offsets, new Date(Date.UTC(2024, 4, 1)).getTimezoneOffset()], html: [...seen.html, render()] };
      },
      { offsets: [], html: [] },
    );
  } finally {
    if (before === undefined) delete process.env['TZ'];
    else process.env['TZ'] = before;
  }
}

describe(`server rendering on React ${version}`, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs on the React major this project is for (NFR-C-03)', () => {
    expect(version.split('.')[0]).toBe(process.env['FHIRQ_REACT_MAJOR']);
  });

  it('renders the initial enablement to a string with no DOM globals and no console output', () => {
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);
    const console = [vi.spyOn(globalThis.console, 'error'), vi.spyOn(globalThis.console, 'warn')];

    const html = renderToString(<Questionnaire session={createSession(SLICE)} />);

    expect(html).toContain('class="fhirq-form"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(`data-path="${SMOKER}"`);
    expect(html).not.toContain(`data-path="${AMOUNT}"`);
    expect(html).not.toMatch(/\sstyle=|<style/);
    for (const spy of console) expect(spy).not.toHaveBeenCalled();
  });

  it('renders from a questionnaire, creating the session during render (ADR-0015)', () => {
    const html = renderToString(<Questionnaire questionnaire={SLICE} />);

    expect(html).toContain(`data-path="${SMOKER}"`);
    expect(html).not.toContain(`data-path="${AMOUNT}"`);
  });

  it('renders a controlling value hydrated, with no diagnostic and no change reported (AC-08.1.2, M6 plan D9)', () => {
    const console = [vi.spyOn(globalThis.console, 'error'), vi.spyOn(globalThis.console, 'warn')];
    const onChange = vi.fn();
    const onDiagnostic = vi.fn();
    const value = { resourceType: 'QuestionnaireResponse', status: 'in-progress', item: [{ linkId: 'smoker', answer: [{ valueBoolean: true }] }, { linkId: 'amount', answer: [{ valueString: 'five' }] }] } as const;

    const html = renderToString(<Questionnaire questionnaire={SLICE} value={value} onChange={onChange} onDiagnostic={onDiagnostic} />);

    expect(html).toMatch(new RegExp(`data-path="${AMOUNT}".*value="five"`));
    for (const spy of [onChange, onDiagnostic, ...console]) expect(spy).not.toHaveBeenCalled();
  });

  it('never calls the resolver on the server, and renders its options pending (M6 plan D3)', async () => {
    const resolver = vi.fn(() => Promise.resolve([{ code: 'red', display: 'Red' }]));

    const html = renderToString(<Probe source={COLOURS} options={{ options: { resolver } }} />);
    await new Promise((settled) => setImmediate(settled));

    expect(html).toContain('colour:pending');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('renders every control kind with no DOM, no style and no console output (M6 step 5)', () => {
    const console = [vi.spyOn(globalThis.console, 'error'), vi.spyOn(globalThis.console, 'warn')];

    const html = renderToString(<Questionnaire questionnaire={KINDS} options={KINDS_OPTIONS} />);

    for (const marker of ['<textarea', 'inputMode="numeric"', '<select class="fhirq-unit"', 'role="group"', 'multiple=""', '<output', 'fhirq-statement', 'fhirq-unsupported', 'fhirq-group', 'fhirq-repeat', '<h4']) {
      expect(html).toContain(marker);
    }
    expect(html).toContain('<b>About</b> you');
    expect(html).not.toMatch(/\sstyle=|<style/);
    for (const spy of console) expect(spy).not.toHaveBeenCalled();
  });

  it('renders dates, decimals and quantities the same in any timezone (ADR-0020, AC-08.3.2)', () => {
    const console = [vi.spyOn(globalThis.console, 'error'), vi.spyOn(globalThis.console, 'warn')];

    const { offsets, html } = inEachZone(() => renderToString(<Questionnaire questionnaire={FORMATS} value={FORMATS_VALUE} options={FORMATS_OPTIONS} />));

    expect(offsets).toEqual([-840, 720]);
    expect(html[1]).toBe(html[0]);
    const shown = [...(html[0] ?? '').matchAll(/<output[^>]*>([^<]*)<\/output>/g)].map(([, text]) => text);
    expect(shown).toEqual(['May 1, 2024', 'May 2024', '2024', 'May 1, 2024, 11:30 PM', '1,234.5', '1.5 mg']);
    expect(html[0]).toContain('value="2024-05-01"');
    expect(html[0]).toContain('value="2024-05-01T00:30:00+14:00"');
    for (const spy of console) expect(spy).not.toHaveBeenCalled();
  });

  it('renders an issue naming a formatted limit the same in any timezone (ADR-0020)', () => {
    const { html } = inEachZone(() => renderToString(<Questionnaire session={refused()} />));

    expect(html[1]).toBe(html[0]);
    expect(html[0]).toContain('Seen: Enter Apr 30, 2024, 12:00 AM or less. You entered May 1, 2024, 12:30 AM.');
  });

  it('renders the demo the same in any timezone', () => {
    const { html } = inEachZone(() => renderToString(<Questionnaire questionnaire={DEMO} />));

    expect(html[1]).toBe(html[0]);
    expect(html[0]).toContain('data-path="visit/visit-date"');
  });

  it('renders settled state from a host-owned session', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'RequestCompletion' });

    const html = renderToString(<Questionnaire session={session} />);

    expect(html).toContain(`data-path="${AMOUNT}"`);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/<section class="fhirq-summary"[^>]*tabindex="-1"/);
    expect(html).toContain('How much do you smoke per day?: Answer this question');
  });
});
