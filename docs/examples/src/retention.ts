import type { Answer, Session } from '@fhirq/core';

import { smoking as questionnaire } from './questionnaires.js';

const set = (session: Session, linkId: string, answer: Answer) => session.dispatch({ type: 'SetAnswer', path: itemPath(linkId), answers: [answer] });

// #region retention
import { createSession, emitResponse, itemPath } from '@fhirq/core';

const kept = createSession(questionnaire); // retention: 'retain-exclude', the default
const erased = createSession(questionnaire, { retention: 'discard' });

for (const session of [kept, erased]) {
  set(session, 'smoker', { kind: 'boolean', value: true }); // shows "per-day"
  set(session, 'per-day', { kind: 'integer', value: 5 });
  set(session, 'smoker', { kind: 'boolean', value: false }); // hides it
}
// Hidden, so neither response holds "per-day".
const responses = [emitResponse(kept), emitResponse(erased)];

for (const session of [kept, erased]) set(session, 'smoker', { kind: 'boolean', value: true });
// Shown again: `kept` has 5 once more; `erased` has nothing.
// #endregion

export { erased, kept, responses };
