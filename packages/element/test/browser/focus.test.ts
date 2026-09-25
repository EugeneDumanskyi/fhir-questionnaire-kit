import { createSession, itemPath, type Session } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bool, questionnaire } from '../../../core/test/slice.js';

/**
 * M7 plan steps 3a and 3b, AC-5: the control that holds focus is never
 * removed or moved while items above it, and after it, are hidden and shown,
 * or while repeat instances above it are added and removed, and typing into
 * it between those cycles keeps the caret. A move would show as its item
 * root removed and inserted, and as a `focusout` from it.
 */

const when = (question: string, answer: boolean) => [{ question, operator: '=' as const, answerBoolean: answer }];

const FORM = questionnaire([
  { linkId: 'toggle', type: 'boolean', text: 'Show the questions around it?' },
  { linkId: 'shown', type: 'string', text: 'Shown with it', enableWhen: when('toggle', true) },
  { linkId: 'hidden', type: 'string', text: 'Hidden with it', enableWhen: when('toggle', false) },
  { linkId: 'typed', type: 'string', text: 'Typed into' },
  { linkId: 'after', type: 'boolean', text: 'Shown after it', enableWhen: when('toggle', true) },
]);

/** Types at the caret, as a keyboard would: the text goes in, then `input` fires. */
function typeAt(input: HTMLInputElement, text: string): void {
  input.setRangeText(text, input.selectionStart ?? 0, input.selectionEnd ?? 0, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the element never moves the focused control (M7 plan step 3a, AC-5)', () => {
  let session: Session;
  let element: FhirQuestionnaireElement;
  let shadow: ShadowRoot;

  beforeEach(() => {
    defineQuestionnaireElement();
    session = createSession(FORM);
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = session;
    document.body.append(element);
    shadow = element.shadowRoot as ShadowRoot;
  });

  afterEach(() => element.remove());

  const itemRoot = (path: string) => shadow.querySelector(`[data-path="${path}"]`);

  it('while items above it and after it are hidden and shown, cycle after cycle', () => {
    const input = itemRoot('typed')?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) throw new Error('no text field');
    input.focus();
    typeAt(input, 'ab');
    input.setSelectionRange(1, 1);

    const observer = new MutationObserver(() => undefined);
    observer.observe(shadow, { subtree: true, childList: true });
    let focusOuts = 0;
    shadow.addEventListener('focusout', () => {
      focusOuts += 1;
    });
    const placed: Node[] = [];

    for (const [cycle, shown] of [true, false, true, false].entries()) {
      session.dispatch({ type: 'SetAnswer', path: itemPath('toggle'), answers: bool(shown) });
      expect([itemRoot('shown') !== null, itemRoot('hidden') !== null, itemRoot('after') !== null]).toEqual([shown, !shown, shown]);
      expect(shadow.activeElement).toBe(input);
      expect(input.selectionStart).toBe(1 + cycle);

      typeAt(input, 'X');
      expect(session.getSnapshot().nodes.find((node) => node.path === itemPath('typed'))?.answers).toEqual([{ kind: 'string', value: `a${'X'.repeat(cycle + 1)}b` }]);
      expect(shadow.activeElement).toBe(input);
      expect(input.selectionStart).toBe(2 + cycle);
      placed.push(...observer.takeRecords().flatMap((mutation) => [...mutation.addedNodes, ...mutation.removedNodes]));
    }

    // Siblings came and went on both sides, 11 times in all; nothing holding the control did.
    expect(placed.filter((node) => node instanceof Element && node.matches('[data-path="shown"], [data-path="hidden"], [data-path="after"]'))).toHaveLength(11);
    expect(placed.filter((node) => node.contains(input))).toEqual([]);
    expect(focusOuts).toBe(0);
    observer.disconnect();
  });
});

const REPEATS = questionnaire([
  {
    linkId: 'meds',
    type: 'group',
    text: 'Medicine',
    repeats: true,
    item: [
      { linkId: 'med-name', type: 'string', text: 'Medicine name' },
      { linkId: 'times', type: 'group', text: 'Time', repeats: true, item: [{ linkId: 'time', type: 'string', text: 'When' }] },
    ],
  },
  { linkId: 'typed', type: 'string', text: 'Typed into' },
]);

describe('the element never moves the focused control for repeat instances (M7 plan step 3b, AC-5)', () => {
  let session: Session;
  let element: FhirQuestionnaireElement;
  let shadow: ShadowRoot;
  let observer: MutationObserver;
  /** Each `focusout`'s related target: where focus went. */
  let wentTo: (EventTarget | null)[];

  beforeEach(() => {
    defineQuestionnaireElement();
    session = createSession(REPEATS);
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = session;
    document.body.append(element);
    shadow = element.shadowRoot as ShadowRoot;
    observer = new MutationObserver(() => undefined);
    wentTo = [];
  });

  afterEach(() => {
    observer.disconnect();
    element.remove();
  });

  const input = (path: string) => {
    const found = shadow.querySelector(`[data-path="${path}"] input`);
    if (!(found instanceof HTMLInputElement)) throw new Error(`no text field at ${path}`);
    return found;
  };
  const add = (...path: (string | number)[]) => session.dispatch({ type: 'AddRepeatInstance', path: itemPath(...path) });
  const remove = (ordinal: number) => session.dispatch({ type: 'RemoveRepeatInstance', path: itemPath('meds'), ordinal });

  /** Focuses the field, types `ab` and puts the caret between them, then starts watching. */
  function focusOn(field: HTMLInputElement): void {
    field.focus();
    typeAt(field, 'ab');
    field.setSelectionRange(1, 1);
    observer.observe(shadow, { subtree: true, childList: true });
    shadow.addEventListener('focusout', (event) => wentTo.push((event as FocusEvent).relatedTarget));
  }

  /** The nodes inserted or removed since the last look. */
  const placed = () => observer.takeRecords().flatMap((mutation) => [...mutation.addedNodes, ...mutation.removedNodes]);

  it('while the instances before its own are removed', () => {
    add('meds');
    add('meds');
    const field = input('meds[2]/med-name');
    focusOn(field);

    // Each removal sends focus to the instance that takes the removed one's place: the focused one, which stays.
    for (const [cycle, ordinal] of [1, 0].entries()) {
      remove(ordinal);
      expect(shadow.querySelector(`[data-path="meds[${ordinal}]"]`)).toBeNull();
      expect(shadow.activeElement).toBe(field);
      expect(field.selectionStart).toBe(1 + cycle);
      typeAt(field, 'X');
      expect(field.value).toBe(`a${'X'.repeat(cycle + 1)}b`);
      expect(shadow.activeElement).toBe(field);
      const nodes = placed();
      expect(nodes.filter((node) => node instanceof Element && node.matches('section'))).toHaveLength(1);
      expect(nodes.filter((node) => node.contains(field))).toEqual([]);
    }
    expect(wentTo).toEqual([]);
  });

  it('while instances above it are added: nothing holding it moves, and focus goes only where the view sends it', () => {
    const field = input('typed');
    focusOn(field);

    // An added instance takes focus (DOM contract §2): the one `focusout` is that move, to its first control.
    add('meds');
    expect(shadow.activeElement).toBe(input('meds[1]/med-name'));
    add('meds', 0, 'times');
    expect(shadow.activeElement).toBe(input('meds[0]/times[1]/time'));
    expect(wentTo).toEqual([input('meds[1]/med-name'), input('meds[0]/times[1]/time')]);

    const nodes = placed();
    expect(nodes.filter((node) => node instanceof Element && node.matches('section'))).toHaveLength(2);
    expect(nodes.filter((node) => node.contains(field))).toEqual([]);
    field.focus();
    expect([field.value, field.selectionStart]).toEqual(['ab', 1]);
  });
});
