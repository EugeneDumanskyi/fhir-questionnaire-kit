import { createSession, emitResponse, itemPath } from '@fhirq/core';

import { smoking as questionnaire } from './questionnaires.js';

const session = createSession(questionnaire);
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
session.dispatch({ type: 'SetAnswer', path: itemPath('per-day'), answers: [{ kind: 'integer', value: 5 }] });
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: false }] });

// #region resume
import { hydrateSession, restoreSession, snapshot } from '@fhirq/core/resume';

// Engine state: the hidden answer to "per-day" comes back.
const restored = restoreSession(questionnaire, snapshot(session));
// A stored response: only what was emitted comes back.
const hydrated = hydrateSession(questionnaire, emitResponse(session));
// #endregion

export { hydrated, restored };
