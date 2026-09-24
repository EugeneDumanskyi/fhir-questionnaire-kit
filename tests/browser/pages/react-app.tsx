import type { OptionResolver, Questionnaire as Form, QuestionnaireResponse, Session } from '@fhirq/core';
import { Questionnaire, useQuestionnaire } from '@fhirq/react';
import { StrictMode, useEffect, useState, version, type ReactElement } from 'react';

import { Intake } from '../../../examples/react-quickstart/src/app.js';
import DEMO from '../../../fixtures/demo/questionnaire.json';
import VALUE_SET from '../../../fixtures/option-resolution/questionnaire.json';
import { SLICE } from '../../../packages/core/test/slice.js';
import { refused } from '../../../packages/react/test/formats.js';
import type { Page } from './names.js';

const calls: string[] = [];
let release = (): void => undefined;
const released = new Promise<void>((resolve) => {
  release = resolve;
});

/**
 * An in-memory resolver that answers only when the proof releases it, so the
 * hydrated form can be seen pending first, as the server rendered it
 * (ADR-0015). It records each call; the gate means none on the server.
 */
const resolver: OptionResolver = (valueSet) => {
  calls.push(valueSet);
  return released.then(() => [
    { system: 'urn:fhirq:test', code: 'a', display: `${valueSet.split('/').pop() ?? ''} A` },
    { system: 'urn:fhirq:test', code: 'b', display: `${valueSet.split('/').pop() ?? ''} B` },
  ]);
};

/**
 * What each page renders: what the hook is handed, made once per mount, its
 * options, and what the proof may reach from `window`. The formats page is a
 * host's own session, completion already refused, so its first render shows
 * issues that name formatted limits.
 */
const FORMS: Readonly<Record<Exclude<Page, 'quickstart'>, { readonly source: () => Form | Session; readonly options?: Parameters<typeof useQuestionnaire>[1]; readonly expose?: object }>> = {
  slice: { source: () => SLICE },
  demo: { source: () => DEMO as Form },
  'value-set': { source: () => VALUE_SET as Form, options: { options: { resolver } }, expose: { calls, release } },
  formats: { source: refused },
};

/** Renders nothing on server and client alike; marks hydration as committed. */
function Ready({ session, expose }: { readonly session?: Session; readonly expose: object | undefined }): null {
  useEffect(() => {
    Object.assign(window, { fhirq: { ...expose, session, ready: true, react: version } });
  }, [session, expose]);
  return null;
}

/**
 * The form, with its session created and owned by the hook during render, on
 * the server and again on the client (ADR-0015). It is handed to the default
 * UI and, from an effect, to the proofs that drive it.
 */
function Body({ page }: { readonly page: Exclude<Page, 'quickstart'> }): ReactElement {
  const { source, options, expose } = FORMS[page];
  const [made] = useState(source);
  const { session } = useQuestionnaire(made, options);
  return (
    <>
      <Questionnaire session={session} />
      <Ready session={session} expose={expose} />
    </>
  );
}

/** Each response the quickstart's host was handed on completion. */
const completed: QuestionnaireResponse[] = [];

/**
 * The quickstart as a host mounts it (M6 AC-1): its session is its own, so
 * the proof reaches only what the host's `onComplete` was handed.
 */
function Quickstart(): ReactElement {
  return (
    <>
      <Intake onComplete={(response) => completed.push(response)} />
      <Ready expose={{ completed }} />
    </>
  );
}

/**
 * The one tree both halves render. `useId` derives from tree position, so the
 * server and the client must render exactly this, not merely the same form.
 * StrictMode on both, so the client's double render and effects run in the
 * proof.
 */
export function App({ page }: { readonly page: Page }): ReactElement {
  return (
    <StrictMode>
      {page === 'quickstart' ? <Quickstart /> : <Body page={page} />}
    </StrictMode>
  );
}
