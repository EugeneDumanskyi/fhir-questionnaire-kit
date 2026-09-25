/**
 * The script-tag embed (NFR-S-03, AC-09.1.1): one file with the element, the
 * engine and the embedded theme, which registers `<fhir-questionnaire>` as it
 * loads. A host that needs its own session options reaches the engine as
 * `fhirq.createSession` (M7 plan D5, D9). Built as an IIFE with the global
 * name `fhirq`, for production.
 */
import { createSession } from '@fhirq/core';

import { defineQuestionnaireElement } from './element.js';

defineQuestionnaireElement();

export { createSession };
