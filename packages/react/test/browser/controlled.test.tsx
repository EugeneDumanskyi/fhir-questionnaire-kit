import { createSession, type Diagnostic, type QuestionnaireResponse, type Session } from '@fhirq/core';
import { Questionnaire, useQuestionnaire } from '@fhirq/react';
import { act, startTransition, StrictMode, useEffect, useState, version, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AMOUNT, questionnaire, SLICE, SMOKER } from '../../../core/test/slice.js';
import { Form } from '../../src/ui/form.js';
import { focus, press, type } from './dom.js';

const NOTE = 'note';
/** The S1 slice, whose hidden answer is retained, and an optional note to type into while an issue shows. */
const FORM = questionnaire([...SLICE.item, { linkId: NOTE, type: 'string', text: 'Anything else?' }]);

/** Lets pending promises and microtasks run, as a page would between tasks. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

type Store = (response: QuestionnaireResponse) => QuestionnaireResponse;

describe(`a form controlled by response on React ${version} (ADR-0015, AC-08.1.2–4)`, () => {
  let host: HTMLElement;
  let root: Root;
  let sessions: Session[];
  let diagnostics: Diagnostic[];
  let emitted: QuestionnaireResponse[];
  let completed: QuestionnaireResponse[];
  let give: (value: QuestionnaireResponse | undefined) => void = () => undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    sessions = [];
    diagnostics = [];
    emitted = [];
    completed = [];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  /** A host that keeps the response it is handed, as `store` makes it, and passes it back: through a transition when `deferred`. */
  function Host({ store, initial, deferred = false }: { readonly store: Store; readonly initial?: QuestionnaireResponse; readonly deferred?: boolean }): ReactElement {
    const [value, setValue] = useState(initial);
    give = setValue;
    const { session, view } = useQuestionnaire(FORM, {
      value,
      onChange: (response) => {
        emitted.push(response);
        const stored = store(response);
        if (deferred) startTransition(() => setValue(stored));
        else setValue(stored);
      },
      onComplete: (response) => completed.push(response),
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });
    useEffect(() => void sessions.push(session), [session]);
    return <Form model={view} />;
  }

  const render = (element: ReactElement) => act(() => root.render(<StrictMode>{element}</StrictMode>));
  const at = (path: string, selector: string) => host.querySelector(`[data-path="${path}"] ${selector}`);
  const smoker = (answer: boolean) => press(at(SMOKER, `input[value="${String(answer)}"]`));

  it.each<[string, Store, boolean]>([
    ['the same object', (response) => response, false],
    ['a structured clone', (response) => structuredClone(response), false],
    ['a JSON round trip', (response) => JSON.parse(JSON.stringify(response)) as QuestionnaireResponse, false],
    ['a structured clone, in a transition', (response) => structuredClone(response), true],
  ])('keeps its session when the host stores %s: retained answers and shown errors survive (AC-08.1.3)', async (_, store, deferred) => {
    render(<Host store={store} deferred={deferred} />);
    smoker(true);
    focus(at(AMOUNT, 'input'));
    focus(at(NOTE, 'input'));
    expect(at(AMOUNT, 'input')?.getAttribute('aria-invalid')).toBe('true');

    type(at(NOTE, 'input'), 'x');
    expect(at(AMOUNT, 'input')?.getAttribute('aria-invalid')).toBe('true');
    type(at(AMOUNT, 'input'), 'ten');
    smoker(false);
    expect(at(AMOUNT, 'input')).toBeNull();
    smoker(true);
    await settle();

    expect(at(AMOUNT, 'input')?.getAttribute('value')).toBe('ten');
    expect(emitted).toHaveLength(5);
    expect(emitted.every((response) => !('authored' in response))).toBe(true);
    expect(new Set(sessions).size).toBe(1);
    expect(diagnostics).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['directly', false],
    ['in a transition', true],
  ])('replaces the session for a response that is not an echo, given %s, once, and says so (AC-08.1.4)', async (_, deferred) => {
    render(<Host store={(response) => structuredClone(response)} />);
    smoker(true);
    type(at(AMOUNT, 'input'), 'ten');
    smoker(false);
    await settle();
    const [first] = sessions;

    const record: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'in-progress', item: [{ linkId: NOTE, answer: [{ valueString: 'from the record' }] }] };
    act(() => (deferred ? startTransition(() => give(record)) : give(record)));
    await settle();

    expect(diagnostics).toEqual([{ code: 'controlled-value-replaced', severity: 'warning', path: null, detail: null, related: [] }]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('fhirq: controlled-value-replaced');
    expect(new Set(sessions).size).toBe(2);
    expect(first?.dispatch({ type: 'NoteItemLeft', path: AMOUNT })).toEqual({ outcome: 'refused', reason: 'disposed' });
    expect(at(NOTE, 'input')?.getAttribute('value')).toBe('from the record');
    expect(at(SMOKER, 'input:checked')).toBeNull();

    // The retained answer went with the old session, and the new one echoes as the old did.
    smoker(true);
    expect(at(AMOUNT, 'input')?.getAttribute('value')).toBe('');
    type(at(NOTE, 'input'), 'edited');
    await settle();
    expect(new Set(sessions).size).toBe(2);
    expect(diagnostics).toHaveLength(1);
  });

  it('hydrates the first value with no diagnostic, and treats a copy of it as an echo (D9)', async () => {
    const initial: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'completed', item: [{ linkId: 'smoker', answer: [{ valueBoolean: true }] }, { linkId: 'amount', answer: [{ valueString: 'five' }] }] };
    render(<Host store={(response) => response} initial={initial} />);
    act(() => give(structuredClone(initial)));
    await settle();

    expect(at(AMOUNT, 'input')?.getAttribute('value')).toBe('five');
    expect(new Set(sessions).size).toBe(1);
    expect(diagnostics).toEqual([]);
  });

  it('keeps the form when the host passes back the same stale value, and when it stops passing one', async () => {
    const initial: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'in-progress' };
    render(<Host store={() => initial} initial={initial} />);
    smoker(true);
    type(at(AMOUNT, 'input'), 'ten');
    act(() => give(undefined));
    await settle();

    expect(at(AMOUNT, 'input')?.getAttribute('value')).toBe('ten');
    expect(new Set(sessions).size).toBe(1);
    expect(diagnostics).toEqual([]);
  });

  it('hands over the completed response, without `authored`, through onComplete', async () => {
    render(<Host store={(response) => response} />);
    smoker(false);
    const [session] = sessions;
    act(() => void session?.dispatch({ type: 'RequestCompletion' }));
    await settle();

    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ status: 'completed', item: [{ linkId: 'smoker', answer: [{ valueBoolean: false }] }] });
    expect(completed[0]).not.toHaveProperty('authored');
    expect(diagnostics).toEqual([]);
  });

  it('takes the controlled props on <Questionnaire>, and reports changes of a session the host owns', async () => {
    const onChange = vi.fn();
    const onDiagnostic = vi.fn();
    act(() => root.render(<Questionnaire questionnaire={FORM} value={{ resourceType: 'QuestionnaireResponse', status: 'in-progress' }} onChange={onChange} onDiagnostic={onDiagnostic} />));
    smoker(true);
    act(() => root.render(<Questionnaire questionnaire={FORM} value={{ resourceType: 'QuestionnaireResponse', status: 'in-progress', item: [] }} onChange={onChange} onDiagnostic={onDiagnostic} />));
    await settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    expect(at(SMOKER, 'input:checked')).toBeNull();

    const owned = sessions.length;
    const session = createSession(FORM);
    const changes = vi.fn();
    act(() => root.render(<Questionnaire session={session} onChange={changes} />));
    smoker(true);
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({ item: [expect.objectContaining({ linkId: 'smoker', answer: [{ valueBoolean: true }] })] }));
    expect(sessions).toHaveLength(owned);
  });
});
