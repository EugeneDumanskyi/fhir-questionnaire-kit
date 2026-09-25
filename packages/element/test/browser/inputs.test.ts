import { createSession, FhirqError, itemPath, type Session } from '@fhirq/core';
import { defineQuestionnaireElement, FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bool, questionnaire, SLICE, SMOKER } from '../../../core/test/slice.js';

/**
 * The element's inputs and lifecycle (M7 plan step 5, D5, D6, ADR-0014 and
 * ADR-0012 notes): where its session comes from, when it is made and
 * replaced, what a new view starts again, and `src`.
 */

const NUMBER = questionnaire([
  { linkId: 'n', type: 'decimal', text: 'A number', extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/minValue', valueDecimal: 1000.5 }] },
]);

let element: FhirQuestionnaireElement;

beforeEach(() => {
  defineQuestionnaireElement();
  element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
});

afterEach(() => {
  element.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const shadow = () => element.shadowRoot as ShadowRoot;
const items = () => [...shadow().querySelectorAll('.fhirq-item')].map((item) => item.getAttribute('data-path'));
const status = () => shadow().querySelector('.fhirq-status')?.textContent;
const field = (path: string) => shadow().querySelector<HTMLInputElement>(`[data-path="${path}"] .fhirq-control`);

function type(input: HTMLInputElement | null, value: string): void {
  if (input === null) throw new Error('no field');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Resolves once the element has raised `type`, with its event. */
const next = <K extends 'fhirq-error' | 'fhirq-change'>(type: K) =>
  new Promise<HTMLElementEventMap[K]>((resolve) => element.addEventListener(type, resolve, { once: true }));

/** Lets pending promises, a stubbed fetch's among them, settle. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Waits until the form shows these items: a stubbed response's body is read in a task of its own. */
const shows = (...paths: string[]) => vi.waitFor(() => expect(items()).toEqual(paths));

/** The limit in the number's issue, shown after a refused completion: formatted in the view's locale. */
function refuse(): void {
  const session = element.session as Session;
  session.dispatch({ type: 'SetAnswer', path: itemPath('n'), answers: [{ kind: 'decimal', value: 5 }] });
  session.dispatch({ type: 'RequestCompletion' });
}
const issue = () => shadow().querySelector('[data-path="n"] .fhirq-error-message')?.textContent ?? '';

describe('the questionnaire property', () => {
  it('makes the session lazily, on first connect, and keeps it across disconnection', () => {
    element.questionnaire = SLICE;
    expect(element.questionnaire).toBe(SLICE);
    expect(element.session).toBeNull();

    document.body.append(element);
    const session = element.session;
    expect(session).not.toBeNull();
    expect(items()).toEqual([SMOKER]);

    element.remove();
    document.body.append(element);
    expect(element.session).toBe(session);
  });

  it('makes the session at once when set on a connected element', () => {
    document.body.append(element);
    element.questionnaire = SLICE;
    expect(items()).toEqual([SMOKER]);
  });

  it('does nothing for the same value, and replaces and disposes the session it made for a new one', () => {
    element.questionnaire = SLICE;
    document.body.append(element);
    const first = element.session as Session;
    element.questionnaire = SLICE;
    expect(element.session).toBe(first);

    element.questionnaire = NUMBER;
    expect(element.session).not.toBe(first);
    expect(first.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) }).outcome).toBe('refused');
    expect(items()).toEqual(['n']);

    element.questionnaire = null;
    expect(element.session).toBeNull();
    expect(items()).toEqual([]);
  });

  it('raises fhirq-error with what createSession threw, and leaves the form empty', async () => {
    document.body.append(element);
    const raised = next('fhirq-error');
    element.questionnaire = { resourceType: 'Questionnaire', status: 'draft', item: [{ linkId: 'a', type: 'string' }, { linkId: 'a', type: 'string' }] };
    const { detail } = await raised;
    expect(detail.error).toBeInstanceOf(FhirqError);
    expect(detail.error).toMatchObject({ code: 'definition-rejected' });
    expect(element.session).toBeNull();
    expect(items()).toEqual([]);
  });
});

describe('the session property', () => {
  it('renders the host’s session, never disposes it, and gives way to a questionnaire set after it', () => {
    const session = createSession(SLICE);
    element.session = session;
    expect(element.session).toBe(session);
    document.body.append(element);
    expect(items()).toEqual([SMOKER]);

    element.questionnaire = NUMBER;
    expect(element.session).not.toBe(session);
    expect(session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) }).outcome).toBe('applied');
    expect(items()).toEqual(['n']);
  });

  it('disposes the session the element made when the host sets its own, and forgets the questionnaire', () => {
    element.questionnaire = SLICE;
    document.body.append(element);
    const made = element.session as Session;
    const session = createSession(NUMBER);
    element.session = session;
    expect(made.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) }).outcome).toBe('refused');
    expect(element.questionnaire).toBeNull();
    expect(items()).toEqual(['n']);

    // The questionnaire it had before is a new value now.
    element.questionnaire = SLICE;
    expect(items()).toEqual([SMOKER]);
  });

  it('starts the form again for a new session: records, the summary and the status region (3a’s finding)', () => {
    const first = createSession(SLICE);
    element.session = first;
    document.body.append(element);
    first.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    first.dispatch({ type: 'RequestCompletion' });
    expect(shadow().querySelector('.fhirq-summary')).not.toBeNull();
    expect(status()).not.toBe('');
    const smoker = shadow().querySelector(`[data-path="${SMOKER}"]`);

    element.session = createSession(SLICE);
    expect(shadow().querySelector('.fhirq-summary')).toBeNull();
    expect(status()).toBe('');
    expect(items()).toEqual([SMOKER]);
    expect(shadow().querySelector(`[data-path="${SMOKER}"]`)).not.toBe(smoker);
  });
});

describe('properties set before the element is defined', () => {
  it('are taken up on connect, where they would otherwise shadow the class’s own', () => {
    const name = 'fhirq-early-upgrade';
    const early = document.createElement(name);
    Object.assign(early, { questionnaire: SLICE, locale: 'de' });
    document.body.append(early);
    customElements.define(name, class extends FhirQuestionnaireElement {});
    const upgraded = early as FhirQuestionnaireElement;
    try {
      expect(Object.hasOwn(upgraded, 'questionnaire')).toBe(false);
      expect(upgraded.questionnaire).toBe(SLICE);
      expect(upgraded.locale).toBe('de');
      expect(upgraded.shadowRoot?.querySelector(`[data-path="${SMOKER}"]`)).not.toBeNull();
    } finally {
      upgraded.remove();
    }
  });
});

describe('a new view', () => {
  beforeEach(() => {
    element.questionnaire = NUMBER;
    document.body.append(element);
  });

  it('is built for a new locale, timeZone or messages, and not for the same one', () => {
    const session = element.session as Session;
    element.locale = 'en';
    refuse();
    expect(issue()).toContain('1,000.5');
    const input = field('n');

    element.locale = 'en';
    expect(field('n')).toBe(input);
    element.locale = 'de';
    expect(issue()).toContain('1.000,5');
    expect(field('n')).not.toBe(input);
    expect(element.session).toBe(session);
  });

  it('drops what was typed and not yet an answer', () => {
    element.locale = 'en';
    type(field('n'), '12x');
    expect(field('n')?.value).toBe('12x');
    element.timeZone = 'Europe/Berlin';
    expect(field('n')?.value).toBe('');
  });

  it('takes messages, key by key', () => {
    element.session = createSession(SLICE);
    const messages = { yes: 'Ja' };
    element.messages = messages;
    expect(element.messages).toBe(messages);
    expect(shadow().querySelector(`[data-path="${SMOKER}"] label`)?.textContent).toBe('Ja');
    element.messages = null;
    expect(shadow().querySelector(`[data-path="${SMOKER}"] label`)?.textContent).toBe('Yes');
  });

  it('reads a wall clock in timeZone as an answer, which without one needs its offset (caret.spec.ts)', () => {
    element.questionnaire = questionnaire([{ linkId: 'at', type: 'dateTime', text: 'When' }]);
    const answers = () => (element.session as Session).getSnapshot().nodes[0]?.answers ?? [];
    type(field('at'), '2024-05-01T14:30');
    expect(answers()).toEqual([]);
    element.timeZone = 'Europe/Berlin';
    expect(element.timeZone).toBe('Europe/Berlin');
    type(field('at'), '2024-05-01T14:30');
    expect(answers()).toEqual([{ kind: 'dateTime', value: '2024-05-01T14:30:00+02:00' }]);
  });

  it('follows the element’s own lang, read on connect and when it changes', () => {
    refuse();
    element.setAttribute('lang', 'de');
    expect(issue()).toContain('1.000,5');
    element.locale = 'en-US';
    element.setAttribute('lang', 'fr');
    expect(issue()).toContain('1,000.5');
  });
});

/** The platform's request function, as a stub stands in for it. */
type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe('src', () => {
  const served = (body: string, init: ResponseInit = {}) => vi.fn<Fetch>(() => Promise.resolve(new Response(body, init)));

  it('GETs the questionnaire once, as FHIR JSON, with the connection’s signal, and renders it', async () => {
    const fetch = served(JSON.stringify(SLICE));
    vi.stubGlobal('fetch', fetch);
    element.setAttribute('src', 'forms/slice.json');
    expect(fetch).not.toHaveBeenCalled();

    document.body.append(element);
    await shows(SMOKER);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('forms/slice.json');
    expect(init).toMatchObject({ headers: { Accept: 'application/fhir+json' }, credentials: 'same-origin' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    // Across a reconnect the session is kept, and nothing is fetched again; the same value does nothing.
    element.remove();
    document.body.append(element);
    element.setAttribute('src', 'forms/slice.json');
    await settled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('replaces the session for a new value, and a load for a value since replaced is dropped', async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetch = vi.fn((input: RequestInfo | URL) =>
      input === 'slow.json' ? new Promise<Response>((resolve) => (answer = resolve)) : Promise.resolve(new Response(JSON.stringify(NUMBER))),
    );
    vi.stubGlobal('fetch', fetch);
    document.body.append(element);
    element.setAttribute('src', 'slow.json');
    element.setAttribute('src', 'fast.json');
    await shows('n');
    const session = element.session;

    answer(new Response(JSON.stringify(SLICE)));
    await settled();
    expect(element.session).toBe(session);
    expect(items()).toEqual(['n']);

    element.removeAttribute('src');
    expect(element.session).toBeNull();
    expect(items()).toEqual([]);
  });

  it('aborts the load on disconnect, raises nothing for it, and loads again on the next connect', async () => {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const { signal } = init ?? {};
      if (signal !== undefined && signal !== null) signals.push(signal);
      return signals.length === 1
        ? new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('The load was aborted', 'AbortError'))))
        : Promise.resolve(new Response(JSON.stringify(SLICE)));
    });
    vi.stubGlobal('fetch', fetch);
    const errors = vi.fn();
    element.addEventListener('fhirq-error', errors);
    element.setAttribute('src', 'slice.json');
    document.body.append(element);
    element.remove();
    await settled();
    expect(signals[0]?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();

    document.body.append(element);
    await shows(SMOKER);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(signals[1]?.aborted).toBe(false);
  });

  const failures: [string, () => Promise<Response>, (cause: unknown) => void][] = [
    ['a response that is not a success', () => Promise.resolve(new Response('', { status: 404 })), (cause) => expect(cause).toMatchObject({ status: 404 })],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch')), (cause) => expect(cause).toBeInstanceOf(TypeError)],
    ['a body that is not JSON', () => Promise.resolve(new Response('<html>')), (cause) => expect(cause).toBeInstanceOf(SyntaxError)],
  ];

  for (const [name, respond, check] of failures) {
    it(`raises fhirq-error for ${name}: request-failed, what failed as its cause, and an empty form, once`, async () => {
      const fetch = vi.fn(respond);
      vi.stubGlobal('fetch', fetch);
      element.setAttribute('src', 'form.json');
      const raised = next('fhirq-error');
      document.body.append(element);
      const { detail } = await raised;
      expect(detail.error).toBeInstanceOf(FhirqError);
      expect(detail.error).toMatchObject({ code: 'request-failed' });
      check((detail.error as FhirqError).cause);
      expect(items()).toEqual([]);

      // A failed value is not tried again on reconnect: only a new one is.
      element.remove();
      document.body.append(element);
      await settled();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  }

  it('raises fhirq-error with what createSession threw for JSON that is not a questionnaire', async () => {
    vi.stubGlobal('fetch', served(JSON.stringify({ resourceType: 'Patient' })));
    element.setAttribute('src', 'patient.json');
    const raised = next('fhirq-error');
    document.body.append(element);
    const { detail } = await raised;
    expect(detail.error).toMatchObject({ code: 'definition-rejected' });
  });

  it('gives way to a questionnaire set after it, and takes over from one when set again to a new value', async () => {
    vi.stubGlobal('fetch', served(JSON.stringify(NUMBER)));
    element.setAttribute('src', 'n.json');
    document.body.append(element);
    await shows('n');
    element.questionnaire = SLICE;
    expect(items()).toEqual([SMOKER]);
    element.setAttribute('src', 'n2.json');
    await shows('n');
    expect(element.questionnaire).toBeNull();
  });
});

describe('one AbortController per connection', () => {
  it('takes its listeners away on disconnect: nothing the respondent does reaches a disconnected form', () => {
    element.questionnaire = SLICE;
    document.body.append(element);
    const radios = () => shadow().querySelectorAll<HTMLInputElement>(`[data-path="${SMOKER}"] input[type="radio"]`);
    element.remove();
    radios()[0]?.click();
    expect((element.session as Session).getSnapshot().nodes[0]?.answers).toEqual([]);

    document.body.append(element);
    radios()[1]?.click();
    expect((element.session as Session).getSnapshot().nodes[0]?.answers).toEqual(bool(false));
  });

  it('adds no second set of listeners when connected twice without a disconnect between', () => {
    const add = vi.spyOn(ShadowRoot.prototype, 'addEventListener');
    element.questionnaire = SLICE;
    document.body.append(element);
    const once = add.mock.calls.length;
    element.connectedCallback();
    expect(add.mock.calls.length).toBe(once);
  });
});
