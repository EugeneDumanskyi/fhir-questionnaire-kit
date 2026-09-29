import { itemPath } from '@fhirq/core';

import { smoking as questionnaire } from './questionnaires.js';

/** A stand-in for the host's own storage: a database row, an encrypted store. The kit stores nothing. */
export const drafts = new Map<string, string>();
const key = 'intake/patient-1';

// #region save
import { createSession } from '@fhirq/core';
import { snapshot } from '@fhirq/core/resume';

const session = createSession(questionnaire);
session.subscribe(() => drafts.set(key, JSON.stringify(snapshot(session))));
// #endregion

session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
session.dispatch({ type: 'SetAnswer', path: itemPath('per-day'), answers: [{ kind: 'integer', value: 5 }] });
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: false }] });

// #region load
import { restoreSession } from '@fhirq/core/resume';

const saved = drafts.get(key);
const resumed = saved === undefined ? createSession(questionnaire) : restoreSession(questionnaire, JSON.parse(saved) as unknown);
// #endregion

export { resumed };
