import type { Session } from '@fhirq/core';
import { Questionnaire, useQuestionnaire } from '@fhirq/react';
import { StrictMode, useEffect, version, type ReactElement } from 'react';

import { SLICE } from '../../../packages/core/test/slice.js';

/** Renders nothing on server and client alike; marks hydration as committed. */
function Ready({ session }: { readonly session: Session }): null {
  useEffect(() => {
    Object.assign(window, { fhirq: { session, ready: true, react: version } });
  }, [session]);
  return null;
}

/**
 * The form, with its session created and owned by the hook during render, on
 * the server and again on the client (ADR-0015). It is handed to the default
 * UI and, from an effect, to the proofs that drive it.
 */
function Form(): ReactElement {
  const { session } = useQuestionnaire(SLICE);
  return (
    <>
      <Questionnaire session={session} />
      <Ready session={session} />
    </>
  );
}

/**
 * The one tree both halves render. `useId` derives from tree position, so the
 * server and the client must render exactly this, not merely the same form.
 * StrictMode on both, so the client's double render and effects run in the
 * proof.
 */
export function App(): ReactElement {
  return (
    <StrictMode>
      <Form />
    </StrictMode>
  );
}
