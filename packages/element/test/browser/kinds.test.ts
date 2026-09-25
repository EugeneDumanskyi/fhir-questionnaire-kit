import { createSession, itemPath, type OptionResolver, type Session, type SessionOptions } from '@fhirq/core';
import { createView, type View, type ViewNode } from '@fhirq/core/view';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { contractViolations } from '../../../../tests/browser/contract-rows.js';
import { KINDS, KINDS_OPTIONS, KINDS_VS } from '../kinds.js';

/**
 * The kind descriptors (M7 plan steps 3b and 4) against the DOM contract's rows
 * (docs/08-dom-contract.md §3), all 18 kinds, on first render and after each kind is used,
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

/** Chooses these option values in a list, then `change`. */
function choose(select: Element | null, ...values: string[]): void {
  if (!(select instanceof HTMLSelectElement)) throw new Error('no list');
  for (const option of select.options) option.selected = values.includes(option.value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function press(control: Element | null): void {
  if (!(control instanceof HTMLElement)) throw new Error('nothing to press');
  control.click();
}

/** Lets a resolver's promise settle, and the cycle it starts run. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function focus(control: Element | null): void {
  if (!(control instanceof HTMLElement)) throw new Error('nothing to focus');
  control.focus();
}

describe('the element draws every kind (docs/08-dom-contract.md §3)', () => {
  let session: Session;
  let element: FhirQuestionnaireElement;
  let shadow: ShadowRoot;
  let probe: View;

  /** A fresh element over a session of every kind, in place of the one before. */
  function mount(options: SessionOptions = {}): void {
    element?.remove();
    session = createSession(KINDS, { ...KINDS_OPTIONS, ...options });
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = session;
    document.body.append(element);
    shadow = element.shadowRoot as ShadowRoot;
    probe = createView(session, { idPrefix: 'fhirq', locale: 'en' });
  }

  beforeEach(() => {
    defineQuestionnaireElement();
    mount();
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

  it('draws every row for all 18 kinds, rich labels, repeat instances and nested headings included, and moves no focus', () => {
    const kinds = new Set<string>();
    const walk = (nodes: readonly ViewNode[]): void => {
      for (const node of nodes) {
        kinds.add(node.control);
        if (node.control === 'group') walk(node.children);
        if (node.control === 'repeating-group') for (const instance of node.instances) walk(instance.children);
      }
    };
    walk(probe.getSnapshot().nodes);

    expect(kinds.size).toBe(18);
    expect(violations()).toEqual([]);
    // The host sanitizer's markup as given (INV-X-06), in a label and as a statement.
    expect(at('name', 'label > span:not([class])')?.innerHTML).toBe('<i>Name</i>');
    expect(at('intro', '.fhirq-statement')?.innerHTML).toBe('<b>About</b> you');
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

  const code = (path: string) => answers(path).map((answer) => (typeof answer === 'object' && answer !== null && 'code' in answer ? answer.code : answer));

  it('hands every option kind its keys, and an open choice its free text (§3.2, §3.5)', () => {
    press(at('smoker', 'input[value="true"]'));
    press(at('colour', 'input[value="1"]'));
    choose(at('country', 'select'), '2');
    choose(at('size', 'select'), '0');
    press(at('pets', 'input[value="0"]'));
    press(at('pets', 'input[value="2"]'));
    choose(at('foods', 'select'), '1', '3');
    expect(violations()).toEqual([]);
    expect([code('smoker'), code('colour'), code('country'), code('size'), code('pets'), code('foods')]).toEqual([[true], ['o2'], ['o3'], ['o1'], ['o1', 'o3'], ['o2', 'o4']]);

    press(at('pets', 'input[value="0"]'));
    choose(at('size', 'select'), '');
    choose(at('foods', 'select'), '3');
    expect([code('pets'), code('size'), code('foods')]).toEqual([['o3'], [], ['o4']]);
    expect(violations()).toEqual([]);

    type(at('route', '.fhirq-other-text'), 'By mouth');
    expect(code('route')).toEqual(['By mouth']);
    press(at('route', 'input[value="0"]'));
    expect(code('route')).toEqual(['o1']);
    expect(at('route', '.fhirq-other-text')).toHaveProperty('value', '');
    expect(violations()).toEqual([]);
  });

  it('shows a list with nothing selected as nothing selected, and a menu its empty option (§3.5)', () => {
    const list = at('country', 'select') as HTMLSelectElement;
    const menu = at('size', 'select') as HTMLSelectElement;
    expect([list.selectedIndex, menu.selectedIndex]).toEqual([-1, 0]);
    choose(list, '4');
    choose(menu, '2');
    expect([list.selectedIndex, menu.selectedIndex]).toEqual([4, 3]);
    session.dispatch({ type: 'ClearAnswer', path: itemPath('country') });
    session.dispatch({ type: 'ClearAnswer', path: itemPath('size') });
    expect([list.selectedIndex, menu.selectedIndex]).toEqual([-1, 0]);
    expect(violations()).toEqual([]);
  });

  it('says why a value set has no options yet, and retries a failed one (§3.5, AC-07.1.2)', async () => {
    expect(at('coded', '.fhirq-options-status')?.textContent).not.toBe('');
    mount({ resolver: () => new Promise(() => undefined) });
    expect(at('coded', '.fhirq-options-status')?.textContent).toBe('Loading the choices');
    expect(at('coded', '.fhirq-retry')).toBeNull();
    expect(violations()).toEqual([]);

    let attempts = 0;
    const resolver: OptionResolver = (valueSet) => {
      attempts += 1;
      return attempts === 1 || valueSet !== KINDS_VS ? Promise.reject(new Error('offline')) : Promise.resolve([{ code: 'a', display: 'A' }]);
    };
    mount({ resolver });
    await settled();
    const root = at('coded');
    expect(at('coded', '.fhirq-retry')?.textContent).toBe('Try again');
    expect(violations()).toEqual([]);

    press(at('coded', '.fhirq-retry'));
    await settled();
    expect(attempts).toBe(2);
    expect([at('coded', '.fhirq-retry'), at('coded', '.fhirq-options-status')]).toEqual([null, null]);
    expect(at('coded')).toBe(root);
    press(at('coded', 'input[value="0"]'));
    expect(code('coded')).toEqual(['a']);
    expect(violations()).toEqual([]);
  });

  it('builds a new root when a resolved value set turns the radios into a list (controlKind)', async () => {
    mount({ resolver: () => Promise.resolve(Array.from({ length: 7 }, (_, i) => ({ code: `c${i}`, display: `C ${i}` }))) });
    const radios = at('coded');
    expect(at('coded', '.fhirq-choices')).not.toBeNull();
    await settled();
    expect(at('coded')).not.toBe(radios);
    expect(radios?.isConnected).toBe(false);
    expect(shadow.querySelectorAll('[data-path="coded"]')).toHaveLength(1);
    choose(at('coded', 'select'), '6');
    expect(code('coded')).toEqual(['c6']);
    expect(violations()).toEqual([]);
  });

  it('calls leave when focus leaves an option item, not when it moves to its other choices or its free text (§1)', () => {
    focus(at('colour', 'input[value="0"]'));
    focus(at('colour', 'input[value="1"]'));
    expect(at('colour', '.fhirq-error')).toHaveProperty('hidden', true);
    focus(at('country', 'select'));
    expect(at('colour', '.fhirq-error')).toHaveProperty('hidden', false);

    focus(at('route', 'input[value="0"]'));
    focus(at('route', '.fhirq-other-text'));
    expect(at('route', '.fhirq-error')).toHaveProperty('hidden', true);
    expect(violations()).toEqual([]);

    // Read-only kinds hold no focus stop to leave.
    for (const path of ['intro', 'score', 'file']) expect(at(path, 'input, select, textarea, button, output[tabindex]')).toBeNull();
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
