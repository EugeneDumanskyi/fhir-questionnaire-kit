import { createSession, type Session } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { useEffect, version, type ReactElement } from 'react';

import { SLICE } from '../../../packages/core/test/slice.js';

/** Renders nothing on server and client alike; marks hydration as committed. */
function Ready({ session }: { readonly session: Session }): null {
  useEffect(() => {
    Object.assign(window, { fhirq: { session, ready: true, react: version } });
  }, [session]);
  return null;
}

/**
 * The one tree both halves render. `useId` derives from tree position, so the
 * server and the client must render exactly this, not merely the same form.
 */
export function App({ session = createSession(SLICE) }: { readonly session?: Session }): ReactElement {
  return (
    <>
      <Questionnaire session={session} />
      <Ready session={session} />
    </>
  );
}
