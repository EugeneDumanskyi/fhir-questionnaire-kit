import { smoking as questionnaire } from './questionnaires.js';

// #region control
import { Questionnaire } from '@fhirq/react';
import type { ControlProps } from '@fhirq/core/view';

/** A switch in place of the two radio buttons, for every yes/no question. */
function Switch({ node, ids, set, leave }: ControlProps<'yes-no'>) {
  return (
    <input
      type="checkbox"
      role="switch"
      id={ids.control}
      checked={node.value === true}
      aria-invalid={node.invalid}
      aria-describedby={node.invalid ? ids.error : undefined}
      onChange={(event) => set(event.currentTarget.checked ? 'true' : 'false')}
      onBlur={leave}
    />
  );
}

export const Intake = () => <Questionnaire questionnaire={questionnaire} controls={{ 'yes-no': Switch }} />;
// #endregion
