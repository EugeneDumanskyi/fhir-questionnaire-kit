import { createSession } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { act, StrictMode, version } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AMOUNT, SLICE, SMOKER } from '../../../core/test/slice.js';

/**
 * The client half in a real browser (M6 plan D4): effects and handlers run
 * here, and nowhere in the Node projects. Runs once per React major.
 */
describe(`client rendering on React ${version}`, () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('runs on the React major this project is for (NFR-C-03)', () => {
    expect(version.split('.')[0]).toBe(import.meta.env.FHIRQ_REACT_MAJOR);
  });

  it('answers through a handler and shows the question that enables', () => {
    act(() => root.render(<StrictMode><Questionnaire session={createSession(SLICE)} /></StrictMode>));
    expect(host.querySelector(`[data-path="${AMOUNT}"]`)).toBeNull();

    const yes = host.querySelector<HTMLInputElement>(`[data-path="${SMOKER}"] input[type="radio"]`);
    act(() => yes?.click());

    expect(host.querySelector(`[data-path="${AMOUNT}"]`)).not.toBeNull();
  });
});
