import { createSession, type QuestionnaireResponse } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { lock } from '../../../core/test/safety/doors.js';
import { AMOUNT, SLICE, SMOKER, text } from '../../../core/test/slice.js';
import { KINDS, KINDS_OPTIONS } from '../kinds.js';

/**
 * The element's events and `requestCompletion()` (M7 plan step 5, D2, D5,
 * ADR-0014 note), and AC-14.6.1's storage half for it: nothing it does is
 * persisted. Its one network path, `default-resolver.ts`, is held to its
 * requests in step 6.
 */

let element: FhirQuestionnaireElement;

beforeEach(() => {
  defineQuestionnaireElement();
  element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
  element.questionnaire = SLICE;
  document.body.append(element);
});

afterEach(() => element.remove());

const shadow = () => element.shadowRoot as ShadowRoot;
const radio = (index: number) => shadow().querySelectorAll<HTMLInputElement>(`[data-path="${SMOKER}"] input[type="radio"]`)[index];

function type(value: string): void {
  const input = shadow().querySelector<HTMLInputElement>(`[data-path="${AMOUNT}"] input`);
  if (input === null) throw new Error('no field');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Every event of these types the element raises, in order. */
function record(...types: ('fhirq-change' | 'fhirq-complete' | 'fhirq-error')[]): CustomEvent[] {
  const seen: CustomEvent[] = [];
  for (const type of types) element.addEventListener(type, (event) => seen.push(event));
  return seen;
}

/** Every object in `value` is a plain object or an array: no class, no `Date`, no `Map`, no prototype of the kit's. */
function plainThroughout(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  return Object.values(value).every(plainThroughout);
}

describe('fhirq-change and fhirq-complete', () => {
  it('carry the response after each change, without authored, as plain data: a JSON round trip is equal', () => {
    const seen = record('fhirq-change');
    radio(0)?.click();
    type('10');

    expect(seen.map((event) => event.type)).toEqual(['fhirq-change', 'fhirq-change']);
    const last = seen.at(-1);
    expect(last?.bubbles).toBe(true);
    const response = last?.detail as QuestionnaireResponse;
    expect(response).toMatchObject({ resourceType: 'QuestionnaireResponse', status: 'in-progress' });
    expect(response).not.toHaveProperty('authored');
    expect(plainThroughout(response)).toBe(true);
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    expect(JSON.stringify(response)).toContain('"valueString":"10"');
  });

  it('raises nothing for a cycle that leaves the response as it was', () => {
    const seen = record('fhirq-change', 'fhirq-complete');
    // Required and empty: leaving it surfaces an issue, and the response is unchanged.
    radio(0)?.click();
    seen.length = 0;
    shadow().querySelector<HTMLInputElement>(`[data-path="${AMOUNT}"] input`)?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(shadow().querySelector(`[data-path="${AMOUNT}"] .fhirq-error-message`)).not.toBeNull();
    expect(seen).toEqual([]);
  });

  it('requestCompletion() completes the form: fhirq-complete alone carries the completed response, plain', () => {
    const seen = record('fhirq-change', 'fhirq-complete');
    radio(1)?.click();
    seen.length = 0;
    element.requestCompletion();

    // The answers are as they were, so no change: completing is its own event, as React's `onComplete`.
    expect(seen.map((event) => event.type)).toEqual(['fhirq-complete']);
    const response = seen[0]?.detail as QuestionnaireResponse;
    expect(response).toMatchObject({ status: 'completed' });
    expect(response).not.toHaveProperty('authored');
    expect(plainThroughout(response)).toBe(true);
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });

  it('requestCompletion() on a form with an issue raises no fhirq-complete, and the summary shows why', () => {
    const seen = record('fhirq-complete');
    radio(0)?.click();
    element.requestCompletion();
    expect(seen).toEqual([]);
    expect(shadow().activeElement).toBe(shadow().querySelector('.fhirq-summary'));
  });

  it('requestCompletion() with no session does nothing', () => {
    const empty = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    expect(() => empty.requestCompletion()).not.toThrow();
  });

  it('are raised only while connected: the listeners go with the connection', () => {
    const seen = record('fhirq-change');
    const session = element.session;
    element.remove();
    session?.dispatch({ type: 'SetAnswer', path: SMOKER, answers: [{ kind: 'boolean', value: false }] });
    expect(seen).toEqual([]);
    document.body.append(element);
    session?.dispatch({ type: 'SetAnswer', path: SMOKER, answers: [{ kind: 'boolean', value: true }] });
    expect(seen).toHaveLength(1);
  });

  it('come from the host’s session as from one the element made, and stop once it is replaced', () => {
    const session = createSession(SLICE);
    element.session = session;
    const seen = record('fhirq-change');
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: [{ kind: 'boolean', value: true }] });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('3') });
    expect(seen).toHaveLength(2);
    element.questionnaire = SLICE;
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('4') });
    expect(seen).toHaveLength(2);
  });
});

it('persists nothing: with every door locked, the element is driven through its lifecycle and touches none (AC-14.6.1, NFR-X-02)', () => {
  const doors = lock(window, navigator, document);
  const host = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
  const events = vi.fn();
  try {
    for (const type of ['fhirq-change', 'fhirq-complete', 'fhirq-error'] as const) host.addEventListener(type, events);
    host.setAttribute('lang', 'de');
    host.questionnaire = KINDS;
    document.body.append(host);
    host.session = createSession(KINDS, KINDS_OPTIONS);
    host.locale = 'en';
    host.timeZone = 'Europe/Berlin';
    host.messages = { yes: 'Ja' };
    const shadow = host.shadowRoot as ShadowRoot;
    shadow.querySelector<HTMLInputElement>('[data-path="smoker"] input[type="radio"]')?.click();
    const name = shadow.querySelector<HTMLInputElement>('[data-path="name"] input');
    if (name !== null) {
      name.value = 'Ada';
      name.dispatchEvent(new Event('input', { bubbles: true }));
    }
    host.requestCompletion();
    for (let round = 0; round < 3; round += 1) {
      host.remove();
      document.body.append(host);
    }
    host.questionnaire = SLICE;
    host.questionnaire = null;
  } finally {
    host.remove();
    doors.unlock();
  }
  expect(doors.touched).toEqual([]);
  expect(events).toHaveBeenCalled();
});
