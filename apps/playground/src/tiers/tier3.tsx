import type { Session } from '@fhirq/core';
import type { ControlProps } from '@fhirq/core/view';
import { Questionnaire } from '@fhirq/react';
import type { JSX } from 'react';

import { messages } from '../host.js';

/**
 * Tier 3: the host's own control for one control kind, here a yes-or-no
 * question as a menu. The kit still draws the label, the required marker and
 * the error around it; the control applies the ids it is given, as the
 * contract asks (ADR-0013). Every other kind keeps the default.
 */
function YesNo({ node, ids, set, clear, leave }: ControlProps<'yes-no'>): JSX.Element {
  return (
    <select
      id={ids.control}
      aria-invalid={node.invalid}
      aria-describedby={node.invalid ? ids.error : undefined}
      value={node.options.find((option) => option.selected)?.key ?? ''}
      onChange={(event) => (event.currentTarget.value === '' ? clear() : set(event.currentTarget.value))}
      onBlur={leave}
    >
      <option value="">Choose</option>
      {node.options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Written once, outside render: the map is compared by its entries either way. */
const controls = { 'yes-no': YesNo };

export function Tier3({ session }: { readonly session: Session }): JSX.Element {
  return <Questionnaire session={session} messages={messages} controls={controls} />;
}
