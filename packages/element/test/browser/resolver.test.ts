import { createSession, FhirqError, type OptionResolver } from '@fhirq/core';
import { defineQuestionnaireElement, FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { questionnaire } from '../../../core/test/slice.js';
import { valueSetResolver } from '../../src/default-resolver.js';

/**
 * The default value-set resolver (M7 plan step 6, ADR-0012): its request
 * shape and its contract suite against a mocked server (success, nested
 * `contains`, non-2xx, malformed JSON, abort on dispose), then what each
 * outcome becomes on the element, with `value-set-base` and the `resolver`
 * property that replaces it.
 */

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const BASE = 'https://tx.example/fhir';
const COLOURS = 'http://example.org/fhir/ValueSet/colours|1.0';
const SIZES = 'http://example.org/fhir/ValueSet/sizes';

const expansion = (contains?: unknown) => ({ resourceType: 'ValueSet', expansion: contains === undefined ? {} : { contains } });
const served = (body: unknown, init: ResponseInit = {}) =>
  vi.fn<Fetch>(() => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), init)));
const signal = () => new AbortController().signal;

/** What the resolver rejected with: always `request-failed`, the cause checked by the caller. */
async function rejection(resolve: PromiseLike<unknown>): Promise<unknown> {
  const error = await Promise.resolve(resolve).then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(FhirqError);
  expect(error).toMatchObject({ code: 'request-failed' });
  return (error as FhirqError).cause;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the default resolver’s contract (ADR-0012)', () => {
  it('GETs {base}/ValueSet/$expand?url={canonical} once, as FHIR JSON, same-origin credentials, with the session’s signal', async () => {
    const fetch = served(expansion([{ system: 'urn:c', code: 'red', display: 'Red' }]));
    vi.stubGlobal('fetch', fetch);
    const aborts = signal();
    await valueSetResolver(`${BASE}/`)(COLOURS, { signal: aborts });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/ValueSet/$expand?url=${encodeURIComponent(COLOURS)}`);
    expect(init).toEqual({ headers: { Accept: 'application/fhir+json' }, credentials: 'same-origin', signal: aborts });
  });

  it('keeps a relative base relative, for fetch to resolve against the document', async () => {
    const fetch = served(expansion([]));
    vi.stubGlobal('fetch', fetch);
    await valueSetResolver('fhir')(SIZES, { signal: signal() });
    expect(fetch.mock.calls[0]?.[0]).toBe(`fhir/ValueSet/$expand?url=${encodeURIComponent(SIZES)}`);
  });

  it('succeeds with the expansion’s options, in order, system and display only when given', async () => {
    vi.stubGlobal(
      'fetch',
      served(expansion([{ system: 'urn:c', code: 'red', display: 'Red', version: '2' }, { code: 'blue' }, { system: 'urn:c', code: 'green', display: 7 }])),
    );
    expect(await valueSetResolver(BASE)(COLOURS, { signal: signal() })).toEqual([
      { system: 'urn:c', code: 'red', display: 'Red' },
      { code: 'blue' },
      { system: 'urn:c', code: 'green' },
    ]);
  });

  it('flattens nested contains in document order, leaving out abstract entries and entries with no code', async () => {
    vi.stubGlobal(
      'fetch',
      served(
        expansion([
          { display: 'Warm', contains: [{ code: 'red' }, { code: 'orange', contains: [{ code: 'amber' }] }] },
          { code: 'cool', abstract: true, contains: [{ code: 'blue' }] },
          { code: 'grey', abstract: false },
        ]),
      ),
    );
    const options = await valueSetResolver(BASE)(COLOURS, { signal: signal() });
    expect(options.map((option) => option.code)).toEqual(['red', 'orange', 'amber', 'blue', 'grey']);
  });

  it('succeeds with no options for an expansion that contains nothing', async () => {
    vi.stubGlobal('fetch', served(expansion()));
    expect(await valueSetResolver(BASE)(COLOURS, { signal: signal() })).toEqual([]);
  });

  it.each([404, 500])('rejects a %i with request-failed, the response as its cause', async (status) => {
    vi.stubGlobal('fetch', served(expansion([{ code: 'red' }]), { status }));
    expect(await rejection(valueSetResolver(BASE)(COLOURS, { signal: signal() }))).toMatchObject({ status });
  });

  it('rejects a network error with request-failed, the error as its cause', async () => {
    const offline = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn<Fetch>(() => Promise.reject(offline)));
    expect(await rejection(valueSetResolver(BASE)(COLOURS, { signal: signal() }))).toBe(offline);
  });

  it('rejects malformed JSON with request-failed, the parse error as its cause', async () => {
    vi.stubGlobal('fetch', served('{"resourceType":'));
    expect(await rejection(valueSetResolver(BASE)(COLOURS, { signal: signal() }))).toBeInstanceOf(SyntaxError);
  });

  const shapes: [string, unknown][] = [
    ['JSON that is not an object', ['red']],
    ['a resource that is not a ValueSet', { resourceType: 'OperationOutcome', expansion: { contains: [] } }],
    ['a ValueSet with no expansion', { resourceType: 'ValueSet' }],
    ['contains that is not a list', expansion({ code: 'red' })],
    ['an entry that is not an object', expansion([{ code: 'red' }, 'blue'])],
    ['nested contains that is not a list', expansion([{ code: 'red', contains: { code: 'dark-red' } }])],
  ];
  it.each(shapes)('rejects %s with request-failed, the body as its cause', async (_name, body) => {
    vi.stubGlobal('fetch', served(body));
    expect(await rejection(valueSetResolver(BASE)(COLOURS, { signal: signal() }))).toEqual(body);
  });

  it('passes an abort on to the request, and rejects with request-failed, the abort as its cause', async () => {
    const fetch = vi.fn<Fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    );
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const resolving = valueSetResolver(BASE)(COLOURS, controller);
    controller.abort();
    expect(await rejection(resolving)).toMatchObject({ name: 'AbortError' });
  });
});

describe('on the element', () => {
  /** Two items share one value set and a third has another: two requests, not three. */
  const CODED = questionnaire([
    { linkId: 'colour', type: 'choice', text: 'Colour', answerValueSet: COLOURS },
    { linkId: 'size', type: 'choice', text: 'Size', answerValueSet: SIZES },
    { linkId: 'shade', type: 'choice', text: 'Shade', answerValueSet: COLOURS },
  ]);
  const OPTIONS = expansion([{ system: 'urn:c', code: 'a', display: 'First' }, { contains: [{ system: 'urn:c', code: 'b', display: 'Second' }] }]);

  let element: FhirQuestionnaireElement;

  beforeEach(() => {
    defineQuestionnaireElement();
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
  });

  afterEach(() => element.remove());

  const at = (path: string, selector: string) => element.shadowRoot?.querySelector(`[data-path="${path}"] ${selector}`) ?? null;
  const labels = (path: string) => [...(element.shadowRoot?.querySelectorAll(`[data-path="${path}"] label`) ?? [])].map((label) => label.textContent);
  const state = (path: string) => at(path, '.fhirq-options-status')?.textContent ?? null;

  it('with value-set-base, resolves each distinct canonical with one GET and shows its options', async () => {
    const fetch = served(OPTIONS);
    vi.stubGlobal('fetch', fetch);
    element.setAttribute('value-set-base', BASE);
    element.questionnaire = CODED;
    document.body.append(element);
    await vi.waitFor(() => expect(labels('shade')).toEqual(['First', 'Second']));
    expect(labels('colour')).toEqual(['First', 'Second']);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${BASE}/ValueSet/$expand?url=${encodeURIComponent(COLOURS)}`,
      `${BASE}/ValueSet/$expand?url=${encodeURIComponent(SIZES)}`,
    ]);
  });

  it('reads value-set-base when it makes the session, so a src loaded later takes it', async () => {
    const fetch = vi.fn<Fetch>((input) => Promise.resolve(new Response(JSON.stringify(input === 'coded.json' ? CODED : OPTIONS))));
    vi.stubGlobal('fetch', fetch);
    element.setAttribute('src', 'coded.json');
    document.body.append(element);
    element.setAttribute('value-set-base', BASE);
    await vi.waitFor(() => expect(labels('size')).toEqual(['First', 'Second']));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('maps a failed request to the failed state: a retry, and a second GET only when it is pressed', async () => {
    const fetch = vi
      .fn<Fetch>()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(OPTIONS))))
      .mockImplementationOnce(() => Promise.resolve(new Response('', { status: 503 })));
    vi.stubGlobal('fetch', fetch);
    element.setAttribute('value-set-base', BASE);
    element.questionnaire = questionnaire([{ linkId: 'colour', type: 'choice', text: 'Colour', answerValueSet: COLOURS }]);
    document.body.append(element);
    await vi.waitFor(() => expect(at('colour', '.fhirq-retry')).not.toBeNull());
    expect(state('colour')).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    (at('colour', '.fhirq-retry') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(labels('colour')).toEqual(['First', 'Second']));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts a request still out when the session it serves is disposed, and ignores its late answer', async () => {
    const signals: AbortSignal[] = [];
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<Fetch>((_input, init) => {
        if (init?.signal !== undefined && init.signal !== null) signals.push(init.signal);
        return new Promise((resolve) => (answer = resolve));
      }),
    );
    element.setAttribute('value-set-base', BASE);
    element.questionnaire = questionnaire([{ linkId: 'colour', type: 'choice', text: 'Colour', answerValueSet: COLOURS }]);
    document.body.append(element);
    const disposed = element.session;
    const changes = vi.fn();
    disposed?.subscribe(changes);

    element.questionnaire = questionnaire([{ linkId: 'size', type: 'choice', text: 'Size', answerValueSet: SIZES }]);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    answer(new Response(JSON.stringify(OPTIONS)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changes).not.toHaveBeenCalled();
  });

  it('without value-set-base or a resolver, makes no request and reports each item unresolved', () => {
    const fetch = vi.fn<Fetch>();
    vi.stubGlobal('fetch', fetch);
    element.questionnaire = CODED;
    document.body.append(element);
    expect(fetch).not.toHaveBeenCalled();
    expect(element.session?.diagnostics.filter((finding) => finding.code === 'unresolved-options')).toHaveLength(3);
    expect(state('colour')).not.toBeNull();
  });

  it('uses the resolver property in place of the default, which then makes no request', async () => {
    const fetch = vi.fn<Fetch>();
    vi.stubGlobal('fetch', fetch);
    const resolver = vi.fn<OptionResolver>(() => Promise.resolve([{ code: 'x', display: 'Mine' }]));
    element.setAttribute('value-set-base', BASE);
    element.resolver = resolver;
    expect(element.resolver).toBe(resolver);
    element.questionnaire = CODED;
    document.body.append(element);
    await vi.waitFor(() => expect(labels('colour')).toEqual(['Mine']));
    expect(resolver.mock.calls.map(([valueSet]) => valueSet)).toEqual([COLOURS, SIZES]);
    expect(resolver.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads either when it makes a session: a session keeps the one it was made with, and the next takes the new', async () => {
    vi.stubGlobal('fetch', served(OPTIONS));
    const resolver = vi.fn<OptionResolver>(() => Promise.resolve([{ code: 'x', display: 'Mine' }]));
    element.setAttribute('value-set-base', BASE);
    element.questionnaire = CODED;
    document.body.append(element);
    const session = element.session;
    element.resolver = resolver;
    element.removeAttribute('value-set-base');
    await vi.waitFor(() => expect(labels('colour')).toEqual(['First', 'Second']));
    expect(element.session).toBe(session);
    expect(resolver).not.toHaveBeenCalled();

    element.questionnaire = questionnaire([...(CODED.item ?? [])]);
    await vi.waitFor(() => expect(labels('colour')).toEqual(['Mine']));
    element.resolver = null;
    expect(element.resolver).toBeNull();
  });

  it('leaves a host’s session to its own options', () => {
    const fetch = vi.fn<Fetch>();
    vi.stubGlobal('fetch', fetch);
    element.setAttribute('value-set-base', BASE);
    element.resolver = vi.fn<OptionResolver>(() => Promise.resolve([]));
    document.body.append(element);
    element.session = createSession(CODED);
    expect(fetch).not.toHaveBeenCalled();
    expect(element.resolver).not.toHaveBeenCalled();
  });

  it('takes up a resolver set before the element is defined', () => {
    const name = 'fhirq-early-resolver';
    const early = document.createElement(name);
    const resolver = vi.fn<OptionResolver>(() => Promise.resolve([{ code: 'x', display: 'Mine' }]));
    Object.assign(early, { resolver, questionnaire: CODED });
    document.body.append(early);
    customElements.define(name, class extends FhirQuestionnaireElement {});
    try {
      expect(Object.hasOwn(early, 'resolver')).toBe(false);
      expect((early as FhirQuestionnaireElement).resolver).toBe(resolver);
      expect(resolver).toHaveBeenCalledTimes(2);
    } finally {
      early.remove();
    }
  });
});
