import type { Questionnaire } from '@fhirq/core';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';

import LARGE from '../../../fixtures/bench/large-500.json';
import DEMO from '../../../fixtures/demo/questionnaire.json';
import { ELEMENT_TYPED, type ElementTyped } from './names.js';

/**
 * The element's keystroke pages (M7 step 9), as a host with a bundler writes
 * one: the element makes its own session from the `questionnaire` property,
 * and the host listens for `fhirq-change`, counting what it is handed.
 */
const FORMS: Readonly<Record<ElementTyped, Questionnaire>> = { demo: DEMO as Questionnaire, 'large-500': LARGE as Questionnaire };

/** How many responses the host was handed. */
const seen = { changes: 0 };

defineQuestionnaireElement();
const element = document.querySelector<FhirQuestionnaireElement>('fhir-questionnaire');
const form = ELEMENT_TYPED.find((name) => name === element?.dataset['page']);
if (element !== null && form !== undefined) {
  element.addEventListener('fhirq-change', () => {
    seen.changes += 1;
  });
  element.questionnaire = FORMS[form];
}
Object.assign(window, { fhirq: { ready: element?.session !== null, seen } });
