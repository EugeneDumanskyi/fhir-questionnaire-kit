import type { QuestionnaireResponse } from '@fhirq/core';
import type { ControlProps } from '@fhirq/core/view';
import { act, StrictMode, useState, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server.browser';
import { expect, it, vi } from 'vitest';

import { lock } from '../../../core/test/safety/doors.js';
import { KINDS, KINDS_OPTIONS, KINDS_VS } from '../kinds.js';
import { focus, press, type } from './dom.js';

/**
 * AC-14.6.1, NFR-X-01, NFR-X-02 for `@fhirq/react` in a browser (M6 plan
 * step 8): with the page's network, storage and beacon doors locked, the
 * entry point loads, then a form is server-rendered, hydrated, answered,
 * controlled by response, overridden at tier 3, completed, replaced and
 * unmounted, and not one door is touched. The server half runs in Node too
 * (`../no-io.test.tsx`).
 */

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

function DateInput({ node, ids, set, leave }: ControlProps<'calendar-date'>): ReactElement {
  return (
    <input
      id={ids.control}
      aria-invalid={node.invalid}
      aria-describedby={node.invalid ? ids.error : undefined}
      value={node.entry}
      onChange={(event) => set(event.currentTarget.value)}
      onBlur={leave}
    />
  );
}

it('loads, hydrates and drives @fhirq/react through every mode, touching no door', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const doors = lock(window, navigator, document);
  const host = document.createElement('div');
  document.body.append(host);
  try {
    const { Questionnaire, useQuestionnaire } = await import('@fhirq/react');
    const resolver = vi.fn(() => Promise.resolve([{ system: 'urn:test', code: 'a', display: 'A' }]));
    const diagnostics: string[] = [];
    let give: (value: QuestionnaireResponse) => void = () => undefined;
    let complete = () => undefined as unknown;

    function Host(): ReactElement {
      const [value, setValue] = useState<QuestionnaireResponse>();
      give = setValue;
      const { session } = useQuestionnaire(KINDS, {
        value,
        onChange: (response) => setValue(structuredClone(response)),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
        options: { ...KINDS_OPTIONS, resolver },
      });
      complete = () => session.dispatch({ type: 'RequestCompletion' });
      return <Questionnaire session={session} controls={{ 'calendar-date': DateInput }} locale="de" timeZone="Europe/Berlin" messages={{ yes: 'Ja' }} />;
    }
    const tree = (
      <StrictMode>
        <Host />
      </StrictMode>
    );

    host.innerHTML = renderToString(tree);
    const root = await act(() => hydrateRoot(host, tree));
    await settle();
    const at = (path: string, selector: string) => host.querySelector(`[data-path="${path}"] ${selector}`);
    focus(at('name', 'input'));
    type(at('name', 'input'), 'Ada');
    focus(at('born', 'input'));
    type(at('born', 'input'), '2024-05-01');
    focus(at('age', 'input'));
    press(at('meds', '.fhirq-add'));
    act(() => void complete());
    press(at('smoker', 'input[value="true"]'));
    act(() => give({ resourceType: 'QuestionnaireResponse', status: 'in-progress', item: [{ linkId: 'name', answer: [{ valueString: 'Grace' }] }] }));
    await settle();
    act(() => root.unmount());

    expect(resolver).toHaveBeenCalledWith(KINDS_VS, expect.anything());
    expect(diagnostics).toEqual(['controlled-value-replaced']);
    expect(doors.touched).toEqual([]);
  } finally {
    doors.unlock();
    host.remove();
    vi.restoreAllMocks();
  }
});
