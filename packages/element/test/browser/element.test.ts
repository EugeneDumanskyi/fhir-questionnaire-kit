import { createSession } from '@fhirq/core';
import { defineQuestionnaireElement, FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AMOUNT, SLICE, SMOKER } from '../../../core/test/slice.js';

/**
 * The element in a real browser (M7 plan D8): the shadow root, adopted
 * sheets and event handlers exist only here. Coverage for NFR-Q-02 is read
 * from this project (`pnpm test:coverage:element`).
 */
describe('the element in Chromium', () => {
  let element: FhirQuestionnaireElement;

  beforeEach(() => {
    defineQuestionnaireElement();
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = createSession(SLICE);
    document.body.append(element);
  });

  afterEach(() => element.remove());

  it('is the class registered under its tag, rendering into an open shadow root', () => {
    expect(customElements.get('fhir-questionnaire')).toBe(FhirQuestionnaireElement);
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
});
