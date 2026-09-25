import type { FhirQuestionnaireElement } from '@fhirq/element';
import { expect, it, vi } from 'vitest';

import { lock } from '../../../core/test/safety/doors.js';
import { questionnaire } from '../../../core/test/slice.js';

/**
 * AC-14.6.1, NFR-X-01 and NFR-X-02 for `@fhirq/element` (M7 plan step 6,
 * ADR-0012 and its M7 note): with every network, storage and beacon door
 * locked, the element is loaded and driven through `src`, the default
 * value-set resolver, a retry and the rest of its lifecycle. The only door
 * touched is `fetch`, once per `src` value and once per canonical and retry,
 * and every touch comes from `default-resolver.ts`. Vitest serves the
 * sources unbundled, so each stack frame names the file it ran in.
 */

const CODED = questionnaire([
  { linkId: 'name', type: 'string', text: 'Name' },
  { linkId: 'colour', type: 'choice', text: 'Colour', answerValueSet: 'http://example.org/fhir/ValueSet/colours' },
  { linkId: 'size', type: 'choice', text: 'Size', answerValueSet: 'http://example.org/fhir/ValueSet/sizes' },
  { linkId: 'shade', type: 'choice', text: 'Shade', answerValueSet: 'http://example.org/fhir/ValueSet/colours' },
]);

/** A stack's frames, each the line that names a source file: Chromium's `at name (url:line:column)`. */
const frames = (stack: string) => stack.split('\n').filter((line) => /\.[cm]?[jt]sx?(\?[^:]*)?:\d+:\d+\)?$/.test(line.trim()));

/** The touch's first frame outside the doors: its caller. The element's project serves its own sources from the root. */
const fromResolver = (stack: string) =>
  /^\s*at \w+ \(https?:\/\/[^/]+\/src\/default-resolver\.ts[?:]/.test(frames(stack).find((frame) => !frame.includes('/test/safety/doors.ts')) ?? '');

it('touches fetch alone, and only from default-resolver.ts: once per src value, once per canonical, once per retry', async () => {
  const doors = lock(window, navigator, document);
  let host: FhirQuestionnaireElement | undefined;
  try {
    const { defineQuestionnaireElement } = await import('@fhirq/element');
    defineQuestionnaireElement();
    host = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    const shadow = host.shadowRoot as ShadowRoot;
    const at = (path: string, selector: string) => shadow.querySelector<HTMLElement>(`[data-path="${path}"] ${selector}`);
    const errors = vi.fn();
    host.addEventListener('fhirq-error', errors);

    // `src`: the locked fetch throws, so the load fails and the form stays empty.
    host.setAttribute('value-set-base', 'https://tx.example/fhir');
    host.setAttribute('src', 'form.json');
    document.body.append(host);
    await vi.waitFor(() => expect(errors).toHaveBeenCalledTimes(1));
    expect(errors.mock.calls[0]?.[0]).toMatchObject({ detail: { error: { code: 'request-failed' } } });

    // The default resolver: two canonicals, three items, and each set failed with a retry.
    host.questionnaire = CODED;
    await vi.waitFor(() => expect(at('size', '.fhirq-retry')).not.toBeNull());
    expect(at('colour', '.fhirq-retry')).not.toBeNull();
    at('size', '.fhirq-retry')?.click();
    await vi.waitFor(() => expect(at('size', '.fhirq-retry')).not.toBeNull());

    // The rest of the lifecycle, which touches nothing.
    const name = at('name', 'input') as HTMLInputElement;
    name.value = 'Ada';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    name.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    host.requestCompletion();
    host.locale = 'de';
    host.remove();
    document.body.append(host);
    host.questionnaire = null;
    host.remove();
  } finally {
    doors.unlock();
    host?.remove();
  }

  expect(doors.touched).toEqual(['fetch', 'fetch', 'fetch', 'fetch']);
  expect(doors.stacks.map(fromResolver)).toEqual([true, true, true, true]);
});

it('tells a touch from anywhere else apart: the control', () => {
  const doors = lock(window, navigator, document);
  try {
    // Read the way any code reads the global, from this file.
    Reflect.get(globalThis, 'fetch');
  } catch {
    // The locked door throws, as it should.
  } finally {
    doors.unlock();
  }
  expect(doors.touched).toEqual(['fetch']);
  expect(doors.stacks.map(fromResolver)).toEqual([false]);
});
