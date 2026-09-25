import { createSession } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';

import { SLICE } from '../../../packages/core/test/slice.js';
import { KINDS } from '../../../packages/element/test/kinds.js';

defineQuestionnaireElement();
const element = document.querySelector<FhirQuestionnaireElement>('fhir-questionnaire');
// The page's form, named by the element (`names.ts`).
const session = createSession(element?.dataset['page'] === 'kinds' ? KINDS : SLICE);
if (element !== null) element.session = session;
Object.assign(window, { fhirq: { session, ready: true } });
