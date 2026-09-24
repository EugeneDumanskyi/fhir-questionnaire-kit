import { createSession, itemPath, type OptionResolver, type Session, type SessionOptions } from '@fhirq/core';
import { createView, type View } from '@fhirq/core/view';
import { Questionnaire } from '@fhirq/react';
import { act, StrictMode, useSyncExternalStore, version, type ReactElement } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server.browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contractViolations } from '../../../../tests/browser/contract-rows.js';
import { Form } from '../../src/ui/form.js';
import { KINDS, KINDS_OPTIONS, KINDS_VS } from '../kinds.js';
import { choose, focus, press, type } from './dom.js';

/** The default UI over a view the test holds, so the contract check reads the same model the form drew. */
function Harness({ view }: { readonly view: View }): ReactElement {
  const model = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  return <Form model={model} />;
}

describe(`the default UI on React ${version} (docs/08-dom-contract.md §3)`, () => {
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

  function mount(options: SessionOptions = {}) {
    const session = createSession(KINDS, { ...KINDS_OPTIONS, ...options });
    const view = createView(session, { idPrefix: 'k', locale: 'en' });
    act(() =>
      root.render(
        <StrictMode>
          <Harness view={view} />
        </StrictMode>,
      ),
    );
    const form = host.querySelector('.fhirq-form');
    if (form === null) throw new Error('no form');
    /** The item root at `path`, or what `selector` finds inside it (`:scope` is the root). */
    const at = (path: string, selector?: string) => {
      const item = host.querySelector(`[data-path="${path}"]`);
      return selector === undefined ? item : (item?.querySelector(selector) ?? null);
    };
    return { session, view, at, violations: () => contractViolations(view.getSnapshot(), form) };
  }

  const answers = (session: Session, path: string) => session.getSnapshot().nodes.find((node) => node.path === path)?.answers.map((answer) => answer.value) ?? [];

  it('draws every row of the contract for all 18 kinds, and moves no focus on mount', () => {
    const { view, violations } = mount();
    const kinds = new Set<string>();
    const walk = (nodes: ReturnType<View['getSnapshot']>['nodes']): void => {
      for (const node of nodes) {
        kinds.add(node.control);
        if (node.control === 'group') walk(node.children);
        if (node.control === 'repeating-group') for (const instance of node.instances) walk(instance.children);
      }
    };
    walk(view.getSnapshot().nodes);

    expect(kinds.size).toBe(18);
    expect(violations()).toEqual([]);
    expect(document.activeElement).toBe(document.body);
  });

  it('hands entry kinds the whole text, keeps a draft that is not a value yet, and grows a repeating question (§3.3)', () => {
    const { session, at, violations } = mount();
    type(at('age', 'input'), '4x');
    expect(answers(session, 'age')).toEqual([]);
    expect(at('age', 'input')).toHaveProperty('value', '4x');
    type(at('age', 'input'), '42');
    expect(answers(session, 'age')).toEqual([42]);
    type(at('notes', 'textarea'), 'Line one');
    expect(answers(session, 'notes')).toEqual(['Line one']);

    type(at('aliases', '.fhirq-entries input'), 'Al');
    type(at('aliases', '.fhirq-entries input:nth-child(2)'), 'Bo');
    expect(answers(session, 'aliases')).toEqual(['Al', 'Bo']);
    expect(host.querySelectorAll('[data-path="aliases"] .fhirq-entries input')).toHaveLength(3);
    expect(violations()).toEqual([]);
  });

  it('sets a quantity’s unit from its list or as typed (§3.4)', () => {
    const { session, at, violations } = mount();
    type(at('weight', '.fhirq-control'), '70');
    choose(at('weight', 'select'), '0');
    expect(answers(session, 'weight')).toEqual([expect.objectContaining({ value: 70, code: 'kg' })]);
    expect(at('weight', 'option[value=""]')).toBeNull();
    type(at('dose', '.fhirq-control'), '5');
    type(at('dose', '.fhirq-unit'), 'mg');
    expect(answers(session, 'dose')).toEqual([expect.objectContaining({ value: 5, unit: 'mg' })]);
    expect(violations()).toEqual([]);
  });

  it('hands every option kind its keys, and an open choice its free text (§3.2, §3.5)', () => {
    const { session, at, violations } = mount();
    press(at('smoker', 'input[value="true"]'));
    press(at('colour', 'input[value="1"]'));
    choose(at('country', 'select'), '2');
    choose(at('size', 'select'), '0');
    press(at('pets', 'input[value="0"]'));
    press(at('pets', 'input[value="2"]'));
    choose(at('foods', 'select'), '1', '3');
    expect(violations()).toEqual([]);
    const code = (path: string) => answers(session, path).map((answer) => (typeof answer === 'object' && answer !== null && 'code' in answer ? answer.code : answer));
    expect([code('smoker'), code('colour'), code('country'), code('size'), code('pets'), code('foods')]).toEqual([[true], ['o2'], ['o3'], ['o1'], ['o1', 'o3'], ['o2', 'o4']]);

    press(at('pets', 'input[value="0"]'));
    choose(at('size', 'select'), '');
    expect([code('pets'), code('size')]).toEqual([['o3'], []]);

    type(at('route', '.fhirq-other-text'), 'By mouth');
    expect(code('route')).toEqual(['By mouth']);
    expect(violations()).toEqual([]);
  });

  it('shows a list with nothing selected as nothing selected, before and after a selection (§3.5)', () => {
    const { session, at } = mount();
    const list = at('country', 'select') as HTMLSelectElement;
    expect(list.selectedIndex).toBe(-1);
    choose(list, '4');
    expect(list.selectedIndex).toBe(4);
    act(() => void session.dispatch({ type: 'ClearAnswer', path: itemPath('country') }));
    expect(list.selectedIndex).toBe(-1);
  });

  it('says why a value set has no options yet, and retries a failed one (§3.5, AC-07.1.2)', async () => {
    const pending = mount({ resolver: () => new Promise(() => undefined) });
    expect(pending.at('coded', '.fhirq-options-status')?.textContent).toBe('Loading the choices');
    expect(pending.at('coded', '.fhirq-retry')).toBeNull();
    expect(pending.violations()).toEqual([]);

    let attempts = 0;
    const resolver: OptionResolver = (valueSet) => {
      attempts += 1;
      return attempts === 1 || valueSet !== KINDS_VS ? Promise.reject(new Error('offline')) : Promise.resolve([{ code: 'a', display: 'A' }]);
    };
    const failing = mount({ resolver });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(failing.at('coded', '.fhirq-retry')?.textContent).toBe('Try again');
    expect(failing.violations()).toEqual([]);

    press(failing.at('coded', '.fhirq-retry'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(attempts).toBe(2);
    expect(failing.at('coded', '.fhirq-retry')).toBeNull();
    expect(failing.at('coded', 'input[value]')?.parentElement?.textContent).toBe('A');
    expect(failing.violations()).toEqual([]);
  });

  it('calls leave when focus leaves an item, not when it moves inside one (§1, the leave rule)', () => {
    const { at, violations } = mount();
    focus(at('colour', 'input[value="0"]'));
    focus(at('colour', 'input[value="1"]'));
    expect(at('colour', '.fhirq-error')).toHaveProperty('hidden', true);
    focus(at('name', 'input'));
    expect(at('colour', '.fhirq-error')).toHaveProperty('hidden', false);

    focus(at('address/street', 'input'));
    focus(at('address/city', 'input'));
    expect(at('address', ':scope > .fhirq-error')).toHaveProperty('hidden', true);
    focus(at('name', 'input'));
    expect(at('address', ':scope > .fhirq-error')).toHaveProperty('hidden', false);
    expect(violations()).toEqual([]);

    // Read-only kinds are never left: they hold no focus stop to leave.
    expect(at('file', 'input, select, textarea, button')).toBeNull();
  });

  it('keys instances by path, moves focus on add and remove, and holds add inert at maxOccurs (§3.8)', () => {
    const { at, violations } = mount();
    const first = host.querySelector('section[data-path="meds[0]"]');
    press(at('meds', ':scope > .fhirq-add'));
    expect(document.activeElement).toBe(host.querySelector('[data-path="meds[1]/med-name"] input'));
    expect(at('meds', ':scope > .fhirq-add')?.getAttribute('aria-disabled')).toBe('true');
    expect(at('meds', ':scope > .fhirq-reason')?.textContent).not.toBe('');
    expect(host.querySelector('[data-path="meds[0]/times"] h4')).not.toBeNull();
    expect(violations()).toEqual([]);

    const second = host.querySelector('section[data-path="meds[1]"]');
    press(first?.querySelector(':scope > .fhirq-remove') ?? null);
    expect(host.querySelector('section[data-path="meds[1]"]')).toBe(second);
    expect(host.querySelector('section[data-path="meds[0]"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[data-path="meds[1]/med-name"] input'));
    expect(violations()).toEqual([]);
  });

  it('shows the summary after a refused completion, focuses it, and links each entry to its control (§2)', () => {
    const { session, at, violations } = mount();
    act(() => void session.dispatch({ type: 'RequestCompletion' }));
    const summary = host.querySelector('.fhirq-summary');
    expect(document.activeElement).toBe(summary);
    expect(host.querySelector('.fhirq-status')?.textContent).toMatch(/not completed/);
    expect(violations()).toEqual([]);

    press(summary?.querySelector('a') ?? null);
    expect(document.activeElement).toBe(at('name', 'input'));
  });

  it('hydrates every kind from server markup with no warning, under StrictMode (ADR-0015, early M6 AC-3)', async () => {
    const errors = vi.spyOn(console, 'error');
    const warnings = vi.spyOn(console, 'warn');
    const app = (
      <StrictMode>
        <Questionnaire questionnaire={KINDS} options={{ ...KINDS_OPTIONS, resolver: () => Promise.resolve([]) }} />
      </StrictMode>
    );
    act(() => root.unmount());
    host.innerHTML = renderToString(app);
    const server = host.innerHTML;
    act(() => {
      root = hydrateRoot(host, app);
    });
    expect(host.innerHTML).toBe(server);
    // The resolver runs after mount and settles; that update is the page's, not hydration's.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(host.querySelector('[data-path="coded"] .fhirq-options-status')).toBeNull();

    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
