import { createSession, type Session } from '@fhirq/core';
import { createView, type View, type ViewNode } from '@fhirq/core/view';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { contractViolations } from '../../../../tests/browser/contract-rows.js';
import { KINDS } from '../kinds.js';

/**
 * The kind descriptors (M7 plan step 3b) against the DOM contract's rows
 * (docs/08-dom-contract.md §3), on first render and after each kind is used,
 * as React's `ui.test.tsx` checks its own. The model checked is a second view
 * over the element's session with the element's id prefix, so its ids are
 * the element's. It holds none of the element's drafts, so the rows are
 * checked where what was typed is what the answers show.
 */

/** Types into a field as a keyboard would end up: the whole text, then `input`. */
function type(field: Element | null, value: string): void {
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) throw new Error('no text field');
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(select: Element | null, value: string): void {
  if (!(select instanceof HTMLSelectElement)) throw new Error('no list');
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function focus(control: Element | null): void {
  if (!(control instanceof HTMLElement)) throw new Error('nothing to focus');
  control.focus();
}

describe('the element draws each kind it builds (docs/08-dom-contract.md §3)', () => {
  let session: Session;
  let element: FhirQuestionnaireElement;
  let shadow: ShadowRoot;
  let probe: View;

  beforeEach(() => {
    defineQuestionnaireElement();
    session = createSession(KINDS);
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = session;
    document.body.append(element);
    shadow = element.shadowRoot as ShadowRoot;
    probe = createView(session, { idPrefix: 'fhirq', locale: 'en' });
  });

  afterEach(() => element.remove());

  /** The item root at `path`, or what `selector` finds inside it (`:scope` is the root). */
  const at = (path: string, selector?: string) => {
    const item = shadow.querySelector(`[data-path="${path}"]`);
    return selector === undefined ? item : (item?.querySelector(selector) ?? null);
  };
  const violations = () => contractViolations(probe.getSnapshot(), shadow.querySelector('.fhirq-form') as Element);
  const answers = (path: string) => session.getSnapshot().nodes.find((node) => node.path === path)?.answers.map((answer) => answer.value) ?? [];
  const fields = (path: string) => [...(at(path, '.fhirq-entries')?.children ?? [])] as HTMLInputElement[];

  it('draws every row for its ten kinds, repeat instances and nested headings included, and moves no focus', () => {
    const kinds = new Set<string>();
    const walk = (nodes: readonly ViewNode[]): void => {
      for (const node of nodes) {
        kinds.add(node.control);
        if (node.control === 'group') walk(node.children);
        if (node.control === 'repeating-group') for (const instance of node.instances) walk(instance.children);
      }
    };
    walk(probe.getSnapshot().nodes);

    expect([...kinds].sort()).toEqual(['calendar-date', 'date-time', 'decimal', 'group', 'integer', 'long-text', 'quantity', 'repeating-group', 'short-text', 'yes-no']);
    expect(violations()).toEqual([]);
    expect(at('meds[0]/times', 'h4')).not.toBeNull();
    expect(shadow.activeElement).toBeNull();
  });

  it('hands entry kinds the whole text, keeps a draft that is not a value yet, and grows a repeating question (§3.3)', () => {
    type(at('age', 'input'), '4x');
    expect(answers('age')).toEqual([]);
    expect(at('age', 'input')).toHaveProperty('value', '4x');
    type(at('age', 'input'), '42');
    expect(answers('age')).toEqual([42]);
    type(at('height', 'input'), '1.8');
    type(at('born', 'input'), '2024-05');
    type(at('notes', 'textarea'), 'Line one');
    expect([answers('height'), answers('born'), answers('notes')]).toEqual([[1.8], ['2024-05'], ['Line one']]);

    type(fields('aliases')[0] ?? null, 'Al');
    type(fields('aliases')[1] ?? null, 'Bo');
    expect(answers('aliases')).toEqual(['Al', 'Bo']);
    expect(fields('aliases').map((field) => field.value)).toEqual(['Al', 'Bo', '']);
    expect(violations()).toEqual([]);
  });

  it('clears a middle entry in place: every field keeps its node, and the ones after it their text (M7 plan D10)', () => {
    for (const [index, name] of ['Al', 'Bo', 'Cy'].entries()) type(fields('aliases')[index] ?? null, name);
    const before = fields('aliases');
    expect(before).toHaveLength(4);

    type(before[1] ?? null, '');
    expect(fields('aliases')).toEqual(before);
    expect(before.map((field) => field.value)).toEqual(['Al', '', 'Cy', '']);
    expect(answers('aliases')).toEqual(['Al', 'Cy']);

    type(before[1] ?? null, 'Di');
    expect(fields('aliases')).toEqual(before);
    expect(answers('aliases')).toEqual(['Al', 'Di', 'Cy']);
    expect(violations()).toEqual([]);
  });

  it('sets a quantity’s unit from its list, which drops its empty option once one is chosen, or as typed (§3.4)', () => {
    type(at('weight', '.fhirq-control'), '70');
    expect([...(at('weight', 'select')?.children ?? [])].map((option) => option.getAttribute('value'))).toEqual(['', '0', '1']);
    choose(at('weight', 'select'), '0');
    expect(answers('weight')).toEqual([expect.objectContaining({ value: 70, code: 'kg' })]);
    expect(at('weight', 'option[value=""]')).toBeNull();
    expect(at('weight', 'select')).toHaveProperty('value', '0');

    type(at('dose', '.fhirq-control'), '5');
    type(at('dose', '.fhirq-unit'), 'mg');
    expect(answers('dose')).toEqual([expect.objectContaining({ value: 5, unit: 'mg' })]);
    expect(violations()).toEqual([]);
  });

  it('calls leave when focus leaves an item or a group, not when it moves inside one (§1, §3.7)', () => {
    focus(at('name', 'input'));
    focus(at('address/street', 'input'));
    expect(at('name', '.fhirq-error')).toHaveProperty('hidden', false);

    focus(at('address/city', 'input'));
    expect(at('address', ':scope > .fhirq-error')).toHaveProperty('hidden', true);
    focus(at('smoker', 'input[value="true"]'));
    focus(at('smoker', 'input[value="false"]'));
    expect(at('address', ':scope > .fhirq-error')).toHaveProperty('hidden', false);
    expect(at('smoker', '.fhirq-error')).toHaveProperty('hidden', true);
    expect(violations()).toEqual([]);
  });

  it('keys instances by path, moves focus on add and remove, and holds add inert at maxOccurs with its reason (§3.8)', () => {
    const add = at('meds', ':scope > .fhirq-add') as HTMLButtonElement;
    const first = at('meds[0]');
    add.click();
    expect(shadow.activeElement).toBe(at('meds[1]/med-name', 'input'));
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(at('meds', ':scope > .fhirq-reason')?.textContent).not.toBe('');
    expect(violations()).toEqual([]);

    // Refused at maxOccurs: nothing is added, and the control keeps focus.
    add.focus();
    add.click();
    expect(shadow.querySelectorAll('[data-path="meds"] > section')).toHaveLength(2);
    expect(shadow.activeElement).toBe(add);

    const second = at('meds[1]');
    (first?.querySelector(':scope > .fhirq-remove') as HTMLButtonElement).click();
    expect([at('meds[0]'), at('meds[1]')]).toEqual([null, second]);
    expect(shadow.activeElement).toBe(at('meds[1]/med-name', 'input'));
    expect([add.getAttribute('aria-disabled'), at('meds', ':scope > .fhirq-reason')]).toEqual([null, null]);
    expect(violations()).toEqual([]);

    // A nested group's instances, named a level further down.
    (at('meds[1]/times', ':scope > .fhirq-add') as HTMLButtonElement).click();
    expect(shadow.activeElement).toBe(at('meds[1]/times[1]/time', 'input'));
    expect(at('meds[1]/times[1]', 'h4')?.textContent).not.toBe('');
    expect(violations()).toEqual([]);
  });

  it('does not take removing an instance with its own remove control for leaving the group (§1, the leave rule)', () => {
    // Chromium fires `focusout` from the focused control the patch removes; focus stays inside the group.
    const remove = at('meds[0]', ':scope > .fhirq-remove') as HTMLButtonElement;
    remove.focus();
    remove.click();
    expect(shadow.activeElement).toBe(at('meds', ':scope > .fhirq-add'));
    expect(at('meds', ':scope > .fhirq-error')).toHaveProperty('hidden', true);

    focus(at('smoker', 'input'));
    expect(at('meds', ':scope > .fhirq-error')).toHaveProperty('hidden', false);
    expect(violations()).toEqual([]);
  });
});
