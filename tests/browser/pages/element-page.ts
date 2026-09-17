import { createSession } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';

import { SLICE } from '../../../packages/core/test/slice.js';

defineQuestionnaireElement();
const session = createSession(SLICE);
const element = document.querySelector<FhirQuestionnaireElement>('fhir-questionnaire');
if (element !== null) element.session = session;
Object.assign(window, { fhirq: { session, ready: true } });
