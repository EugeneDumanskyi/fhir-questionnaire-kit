import { smoking as questionnaire } from './questionnaires.js';

// #region view
import { createSession } from '@fhirq/core';
import { createView } from '@fhirq/core/view';

const view = createView(createSession(questionnaire), { idPrefix: 'intake', locale: 'en-GB', timeZone: 'Europe/London' });
const model = view.getSnapshot();
// #endregion

export { model };
