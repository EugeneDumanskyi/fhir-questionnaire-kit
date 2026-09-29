import type { Questionnaire } from '@fhirq/core';

const VALUE_SET = 'urn:fhirq:docs:contact';
const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [{ linkId: 'contact', text: 'How should we contact you?', type: 'choice', answerValueSet: VALUE_SET }],
};

/** A stand-in for the host's terminology client: down on the first call, up after. */
export const calls: string[] = [];
const terminology = {
  expand: (valueSet: string, { signal }: { signal: AbortSignal }) =>
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      calls.push(valueSet);
      if (calls.length === 1) throw new Error('terminology server unavailable');
      return [
        { system: 'urn:fhirq:docs:contact', code: 'phone', display: 'Phone' },
        { system: 'urn:fhirq:docs:contact', code: 'email', display: 'Email' },
      ];
    }),
};

// #region resolver
import { createSession } from '@fhirq/core';

const session = createSession(questionnaire, {
  resolver: (valueSet, { signal }) => terminology.expand(valueSet, { signal }),
});
// #endregion

// #region retry
const retry = () => {
  if (session.getSnapshot().optionSets[VALUE_SET]?.status === 'failed') {
    session.dispatch({ type: 'RetryOptions', valueSet: VALUE_SET });
  }
};
// #endregion

export { retry, session, VALUE_SET };
