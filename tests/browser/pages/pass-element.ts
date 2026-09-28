import { createSession } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';

import { FORMS } from './forms.js';
import { MATRIX_FORMS } from './names.js';

/**
 * The element's page for the manual screen-reader passes (M8 plan step 10,
 * `docs/accessibility.md`): the form the element names, in the default theme,
 * inside a host form whose submit button asks it to complete, as a host
 * wires `requestCompletion()`. The page adds no status of its own: the kit
 * announces completion, and a second message would spoil the count the
 * passes take (NFR-A-08).
 */

defineQuestionnaireElement();
const element = document.querySelector<FhirQuestionnaireElement>('fhir-questionnaire');
const host = document.querySelector('form');
const form = MATRIX_FORMS.find((name) => name === element?.dataset['form']);
if (element !== null && host !== null && form !== undefined) {
  element.session = createSession(FORMS[form].form, FORMS[form].options);
  host.addEventListener('submit', (event) => {
    event.preventDefault();
    element.requestCompletion();
  });
}
