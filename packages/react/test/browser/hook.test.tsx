import { createSession, type Session } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { act, StrictMode, useState, version, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AMOUNT, bool, SLICE, SMOKER, text } from '../../../core/test/slice.js';
import { COLOURS, COLOURS_VS, Probe } from '../probe.js';

/** Lets pending promises and microtasks run, as a page would between tasks. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const answered = (session: Session) => session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) }).outcome;

describe(`useQuestionnaire on React ${version} (ADR-0015)`, () => {
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

  it('calls the resolver once, after mount, under StrictMode (M6 plan D3)', async () => {
    const mountedAtCall: boolean[] = [];
    const resolver = vi.fn((valueSet: string) => {
      mountedAtCall.push(host.textContent?.includes('colour:pending') === true);
      return Promise.resolve(valueSet === COLOURS_VS ? [{ code: 'red', display: 'Red' }] : []);
    });

    act(() =>
      root.render(
        <StrictMode>
          <Probe source={COLOURS} options={{ options: { resolver } }} />
        </StrictMode>,
      ),
    );
    await settle();

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0]?.[0]).toBe(COLOURS_VS);
    expect(mountedAtCall).toEqual([true]);
    expect(host.textContent).toContain('colour:ready');
  });

  it('keeps an owned session through StrictMode, and disposes it on unmount', async () => {
    let session: Session | undefined;
    act(() =>
      root.render(
        <StrictMode>
          <Probe source={SLICE} onSession={(given) => (session = given)} />
        </StrictMode>,
      ),
    );
    await settle();
    const owned = session;
    if (owned === undefined) throw new Error('no session');
    act(() => expect(answered(owned)).toBe('applied'));
    expect(host.textContent).toContain(`${AMOUNT}:short-text`);

    act(() => root.unmount());
    await settle();
    expect(owned.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) })).toEqual({ outcome: 'refused', reason: 'disposed' });
    root = createRoot(host);
  });

  it('aborts a resolution the host started for a session disposed before it settled', async () => {
    let signal: AbortSignal | undefined;
    const resolver = vi.fn((_: string, context: { readonly signal: AbortSignal }) => {
      signal = context.signal;
      return new Promise<readonly never[]>(() => undefined);
    });
    act(() => root.render(<Probe source={COLOURS} options={{ options: { resolver } }} />));
    await settle();
    expect(signal?.aborted).toBe(false);

    act(() => root.unmount());
    await settle();
    expect(signal?.aborted).toBe(true);
    root = createRoot(host);
  });

  it('leaves a host-owned session undisposed on unmount', async () => {
    const session = createSession(SLICE);
    act(() => root.render(<Questionnaire session={session} />));
    act(() => root.unmount());
    await settle();

    expect(answered(session)).toBe('applied');
    root = createRoot(host);
  });

  it('switches tier over one session without touching it (AC-12.4.1, INV-P-01)', () => {
    const session = createSession(SLICE);
    act(() => root.render(<Questionnaire session={session} />));
    act(() => host.querySelector<HTMLInputElement>('input[type="radio"]')?.click());
    act(() => void session.dispatch({ type: 'RequestCompletion' }));
    const before = session.getSnapshot();
    expect(before.issues.length).toBeGreaterThan(0);
    expect(host.querySelector('[aria-invalid="true"]')).not.toBeNull();

    act(() => root.render(<Probe source={session} />));
    expect(host.textContent).toBe(`${SMOKER}:yes-no ${AMOUNT}:short-text`);
    act(() => root.render(<Questionnaire session={session} locale="de" />));

    expect(session.getSnapshot()).toBe(before);
    expect(host.querySelector(`[data-path="${AMOUNT}"] input`)?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector<HTMLInputElement>(`[data-path="${SMOKER}"] input[value]:checked`)).not.toBeNull();
  });

  it('keeps a host-controlled session across host re-renders (AC-08.1.2)', () => {
    let rerender = (): void => undefined;
    const sessions: Session[] = [];
    function Host(): ReactElement {
      const [session] = useState(() => createSession(SLICE));
      const [count, setCount] = useState(0);
      rerender = () => setCount((value) => value + 1);
      sessions.push(session);
      return (
        <>
          <p>{count}</p>
          <Questionnaire session={session} />
        </>
      );
    }
    act(() => root.render(<Host />));
    const [session] = sessions;
    if (session === undefined) throw new Error('no session');
    act(() => void answered(session));
    act(() => void session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('ten') }));
    act(() => void session.dispatch({ type: 'NoteItemLeft', path: AMOUNT }));
    const before = session.getSnapshot();

    for (let i = 0; i < 3; i += 1) act(() => rerender());

    expect(new Set(sessions).size).toBe(1);
    expect(session.getSnapshot()).toBe(before);
    expect(host.querySelector<HTMLInputElement>(`[data-path="${AMOUNT}"] input`)?.value).toBe('ten');
  });

  it('reads the questionnaire once: a new object for the same component keeps the session (M6 plan D8)', async () => {
    const sessions: Session[] = [];
    const record = (session: Session) => sessions.push(session);
    act(() => root.render(<Probe source={SLICE} onSession={record} />));
    act(() => root.render(<Probe source={structuredClone(SLICE)} onSession={record} />));
    await settle();

    expect(new Set(sessions).size).toBe(1);
  });
});
