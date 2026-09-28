import { createSession, itemPath } from '@fhirq/core';

import { smoking } from './questionnaires.js';

const session = createSession(smoking);
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: false }] });

// #region emit
import { emitResponse } from '@fhirq/core';

const response = emitResponse(session, { authored: '2026-09-18T10:00:00+02:00' });
// #endregion

export { response };
