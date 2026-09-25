import { createSession, type Questionnaire, type SessionOptions } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';

import DEMO from '../../../fixtures/demo/questionnaire.json';
import { SLICE } from '../../../packages/core/test/slice.js';
import { KINDS, KINDS_OPTIONS } from '../../../packages/element/test/kinds.js';
import { ELEMENT_PAGES, type ElementPage } from './names.js';

/** Each page's form, and the options its session is made with. */
const FORMS: Readonly<Record<ElementPage, { readonly form: Questionnaire; readonly options?: SessionOptions }>> = {
  slice: { form: SLICE },
  kinds: { form: KINDS, options: KINDS_OPTIONS },
  demo: { form: DEMO as Questionnaire },
};

defineQuestionnaireElement();
const element = document.querySelector<FhirQuestionnaireElement>('fhir-questionnaire');
// The page's form, named by the element (`names.ts`).
const { form, options } = FORMS[ELEMENT_PAGES.find((name) => name === element?.dataset['page']) ?? 'slice'];
const session = createSession(form, options);
if (element !== null) element.session = session;
Object.assign(window, { fhirq: { session, ready: true } });
