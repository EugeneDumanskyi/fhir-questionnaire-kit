import type { SessionState } from '@fhirq/core';

import { smoking as questionnaire } from './questionnaires.js';

/** What the host draws; here, what the test reads. */
export const rendered: SessionState[] = [];
const render = (state: SessionState) => rendered.push(state);

// #region create
import { createSession, itemPath } from '@fhirq/core';

const session = createSession(questionnaire, { loadMode: 'strict', retention: 'retain-exclude' });
session.subscribe(() => render(session.getSnapshot()));
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
// #endregion

export { session };
