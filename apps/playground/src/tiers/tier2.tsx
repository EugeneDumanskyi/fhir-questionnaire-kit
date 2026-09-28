import '../../../../examples/themed-host/theme.css';
import './tier2.css';

import type { Session } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import type { JSX } from 'react';

import { messages } from '../host.js';

/**
 * Tier 2: design tokens. The same form inside an element of class `intake`,
 * whose stylesheet maps the host's design system onto the kit's tokens: the
 * `examples/themed-host` look, in CSS alone.
 */
export function Tier2({ session }: { readonly session: Session }): JSX.Element {
  return (
    <div className="intake">
      <Questionnaire session={session} messages={messages} />
    </div>
  );
}
