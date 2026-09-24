import { createSession, itemPath, type Diagnostic, type Session } from '@fhirq/core';
import { createView, type ControlProps, type View } from '@fhirq/core/view';
import { Questionnaire } from '@fhirq/react';
import { act, useState, useSyncExternalStore, version, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contractViolations } from '../../../../tests/browser/contract-rows.js';
import { questionnaire } from '../../../core/test/slice.js';
import { contractCheck } from '../../src/contract.js';
import { Form } from '../../src/ui/form.js';
import { KINDS, KINDS_OPTIONS } from '../kinds.js';
import { focus, type } from './dom.js';

const BORN = itemPath('born');

/** A minimal accessible date control: every duty of ADR-0013 met on a text input. */
function DateInput({ node, ids, set, leave }: ControlProps<'calendar-date'>): ReactElement {
  return (
    <input
      className="picker"
      id={ids.control}
      aria-invalid={node.invalid}
      aria-describedby={node.invalid ? ids.error : undefined}
      value={node.entry}
      onChange={(event) => set(event.currentTarget.value)}
      onBlur={leave}
    />
  );
}

/** The same control without its id. */
function Unnamed({ node, set, leave }: ControlProps<'calendar-date'>): ReactElement {
  return <input className="picker" aria-invalid={node.invalid} value={node.entry} onChange={(event) => set(event.currentTarget.value)} onBlur={leave} />;
}

/** With its id, but no ARIA state at all. */
function Stateless({ node, ids, set, leave }: ControlProps<'calendar-date'>): ReactElement {
  return <input className="picker" id={ids.control} value={node.entry} onChange={(event) => set(event.currentTarget.value)} onBlur={leave} />;
}

describe(`tier-3 controls on React ${version} (ADR-0013, docs/08-dom-contract.md §3.9)`, () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  /** The attributes a spy on `onDiagnostic` was told are missing, in order. */
  const expected = (spy: { readonly mock: { readonly calls: readonly (readonly unknown[])[] } }) => spy.mock.calls.map(([diagnostic]) => (diagnostic as Diagnostic).expected);
  const at = (path: string, selector: string) => host.querySelector(`[data-path="${path}"] ${selector}`);
  const answers = (session: Session, path: string) => session.getSnapshot().nodes.find((node) => node.path === path)?.answers.map((answer) => answer.value);

  /** The default UI over a view the test holds, with the development check, so the contract rows read the model the form drew. */
  function Harness({ view, onDiagnostic }: { readonly view: View; readonly onDiagnostic: (diagnostic: Diagnostic) => void }): ReactElement {
    const model = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
    const [check] = useState(() => contractCheck?.(onDiagnostic));
    return <Form model={model} controls={{ 'calendar-date': DateInput }} check={check} />;
  }

  it('renders an accessible override in the kit chrome: label, error and aria-invalid associations hold (AC-10.3.1)', () => {
    const session = createSession(KINDS, KINDS_OPTIONS);
    const view = createView(session, { idPrefix: 'k', locale: 'en' });
    const raised: Diagnostic[] = [];
    act(() => root.render(<Harness view={view} onDiagnostic={(diagnostic) => raised.push(diagnostic)} />));
    const form = host.querySelector('.fhirq-form');
    if (form === null) throw new Error('no form');
    const violations = () => contractViolations(view.getSnapshot(), form, ['calendar-date']);
    expect(violations()).toEqual([]);

    const input = at(BORN, 'input.picker');
    if (!(input instanceof HTMLInputElement)) throw new Error('no override');
    expect(input.labels?.[0]?.textContent).toBe('Born');
    expect(at(itemPath('seen'), 'input.fhirq-control')).not.toBeNull();

    focus(input);
    type(input, '2024-13');
    focus(at(itemPath('seen'), 'input'));
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(error?.classList.contains('fhirq-error')).toBe(true);
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).not.toBe('');
    expect(violations()).toEqual([]);

    type(input, '2024-05-01');
    expect(answers(session, BORN)).toEqual(['2024-05-01']);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(violations()).toEqual([]);
    expect(raised).toEqual([]);
  });

  it('raises control-contract naming calendar-date and id, once, for an override without its id (M6 AC-7)', () => {
    const onDiagnostic = vi.fn();
    act(() => root.render(<Questionnaire questionnaire={KINDS} options={KINDS_OPTIONS} controls={{ 'calendar-date': Unnamed }} onDiagnostic={onDiagnostic} />));
    type(at(BORN, 'input.picker'), '2024');

    expect(onDiagnostic.mock.calls).toEqual([[{ code: 'control-contract', severity: 'warning', path: BORN, detail: 'calendar-date', expected: 'id', related: [] }]]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('fhirq: control-contract (calendar-date)');
  });

  it('raises each ARIA duty the override misses, when it applies', () => {
    const onDiagnostic = vi.fn();
    act(() => root.render(<Questionnaire questionnaire={KINDS} options={KINDS_OPTIONS} controls={{ 'calendar-date': Stateless }} onDiagnostic={onDiagnostic} />));
    expect(expected(onDiagnostic)).toEqual(['aria-invalid']);

    focus(at(BORN, 'input.picker'));
    type(at(BORN, 'input.picker'), '2024-13');
    focus(at(itemPath('seen'), 'input'));
    expect(expected(onDiagnostic)).toEqual(['aria-invalid', 'aria-describedby']);
  });

  it('re-renders only the item typed into, and none for a host re-render with inline controls (NFR-P-03, ADR-0015)', () => {
    const renders = new Map<string, number>();
    /** A short-text control that counts its renders by path: the probe for the item around it. */
    function Counted({ node, ids, set, leave }: ControlProps<'short-text'>): ReactElement {
      renders.set(node.path, (renders.get(node.path) ?? 0) + 1);
      return <input id={ids.control} aria-invalid={node.invalid} value={node.entry} onChange={(event) => set(event.currentTarget.value)} onBlur={leave} />;
    }
    const form = questionnaire([
      { linkId: 'first', type: 'string', text: 'First' },
      { linkId: 'second', type: 'string', text: 'Second' },
      { linkId: 'third', type: 'string', text: 'Third' },
    ]);
    let rerender = (): void => undefined;
    function Host(): ReactElement {
      const [count, setCount] = useState(0);
      rerender = () => setCount(count + 1);
      return <Questionnaire questionnaire={form} controls={{ 'short-text': Counted }} />;
    }
    act(() => root.render(<Host />));
    expect([...renders.values()]).toEqual([1, 1, 1]);

    type(at(itemPath('second'), 'input'), 'a');
    type(at(itemPath('second'), 'input'), 'ab');
    expect(Object.fromEntries(renders)).toEqual({ first: 1, second: 3, third: 1 });

    act(() => rerender());
    expect(Object.fromEntries(renders)).toEqual({ first: 1, second: 3, third: 1 });
  });
});
