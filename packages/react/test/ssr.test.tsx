import { createSession } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { version } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AMOUNT, bool, SLICE, SMOKER } from '../../core/test/slice.js';

/**
 * AC-6's Node half (M1): server rendering needs no DOM. This file runs twice,
 * once per React major: the `react` project resolves React 19 from this
 * package, `react-18` resolves React 18 from tools/react-18 (vitest.config.ts).
 * Hydration without warnings is the browser half (tests/browser/hydration).
 */
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
