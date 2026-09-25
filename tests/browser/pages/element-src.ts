import { defineQuestionnaireElement } from '@fhirq/element';

/**
 * The element as a page with no host script writes it (M7 plan step 6): it
 * is only registered, and its markup names the form by `src` and the value
 * sets by `value-set-base`. The spec that opens it serves both.
 */
defineQuestionnaireElement();
