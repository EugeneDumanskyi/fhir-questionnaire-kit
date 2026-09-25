import { createSession, type Session } from '@fhirq/core';
import { defineQuestionnaireElement, FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AMOUNT, bool, SLICE, SMOKER, text } from '../../../core/test/slice.js';

/**
 * The element in a real browser (M7 plan D8): the shadow root, adopted
 * sheets and event handlers exist only here. Coverage for NFR-Q-02 is read
 * from this project (`pnpm test:coverage:element`).
 */
describe('the element in Chromium', () => {
  let session: Session;
  let element: FhirQuestionnaireElement;

  beforeEach(() => {
    defineQuestionnaireElement();
    session = createSession(SLICE);
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = session;
    document.body.append(element);
  });

  afterEach(() => element.remove());

  const amountInput = () => element.shadowRoot?.querySelector<HTMLInputElement>(`[data-path="${AMOUNT}"] input`);

  it('is the class registered under its tag, rendering its session into an open shadow root', () => {
    expect(customElements.get('fhir-questionnaire')).toBe(FhirQuestionnaireElement);
    expect(element.session).toBe(session);
    expect(element.shadowRoot?.querySelector('.fhirq-form')).not.toBeNull();
  });

  it('adopts the embedded theme as constructable stylesheets, not as markup', () => {
    const root = element.shadowRoot;
    expect(root?.adoptedStyleSheets.length).toBe(2);
    expect(root?.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules]).length).toBeGreaterThan(0);
    expect(root?.querySelector('style, link')).toBeNull();
  });

  it('answers through a handler and shows the question that enables', () => {
    const root = element.shadowRoot;
    expect(root?.querySelector(`[data-path="${AMOUNT}"]`)).toBeNull();
    root?.querySelector<HTMLInputElement>(`[data-path="${SMOKER}"] input[type="radio"]`)?.click();
    expect(root?.querySelector(`[data-path="${AMOUNT}"]`)).not.toBeNull();
  });

  it('shows the summary after a refused completion, focuses it, and moves focus to the control an entry links to (§2)', () => {
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'RequestCompletion' });
    const root = element.shadowRoot;
    const summary = root?.querySelector('.fhirq-summary');
    expect(root?.activeElement).toBe(summary);
    expect(summary?.previousElementSibling).toBeNull();

    root?.querySelector<HTMLAnchorElement>('.fhirq-summary-link')?.click();
    expect(root?.activeElement).toBe(amountInput());
  });

  it('paints a cycle that a paint set off once that paint ends, from the model current by then', () => {
    // Disconnected, the element misses a refused completion. Reconnected, it
    // paints it and moves focus to the summary; a host that answers on that
    // focus starts a cycle mid-paint, and its render waits for this one.
    element.remove();
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'RequestCompletion' });
    let during: string | undefined;
    element.addEventListener(
      'focusin',
      () => {
        session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('10') });
        during = amountInput()?.value;
      },
      { once: true },
    );

    document.body.append(element);
    expect(during).toBe('');
    expect(amountInput()?.value).toBe('10');
    expect(element.shadowRoot?.querySelector('.fhirq-summary')).toBeNull();
  });
});
