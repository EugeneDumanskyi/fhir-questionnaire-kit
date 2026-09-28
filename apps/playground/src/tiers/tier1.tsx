import type { Session } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import type { JSX } from 'react';

import { messages } from '../host.js';

/** Tier 1: the defaults. The session, and the host's message for its rule; nothing else to set. */
export function Tier1({ session }: { readonly session: Session }): JSX.Element {
  return <Questionnaire session={session} messages={messages} />;
}
