import { createSession, itemPath, type Session } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bool, questionnaire } from '../../../core/test/slice.js';

/**
 * M7 plan step 3a, AC-5: the control that holds focus is never removed or
 * moved while items above it, and after it, are hidden and shown, and typing
 * into it between those cycles keeps the caret. A move would show as its
 * item root removed and inserted, and as a `focusout` from it.
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
