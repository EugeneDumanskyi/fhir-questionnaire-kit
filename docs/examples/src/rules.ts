import { createSession, type Answer } from '@fhirq/core';

import { bloodPressure as questionnaire } from './questionnaires.js';

// #region rules
const reading = (answers?: readonly Answer[]) => {
  const first = answers?.[0];
  return first?.kind === 'integer' ? first.value : null;
};

const session = createSession(questionnaire, {
  rules: [{
    inputs: ['systolic', 'diastolic'],
    check: ({ systolic, diastolic }) =>
      (reading(systolic) ?? 0) <= (reading(diastolic) ?? 0) ? 'bp-order' : null,
  }],
});
// #endregion

export { session };
