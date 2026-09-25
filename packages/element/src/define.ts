/**
 * `@fhirq/element/define`: importing it registers `<fhir-questionnaire>`.
 * Built to import the element from `./index.js`, so a page that imports both
 * entries loads one class (M7 plan D9).
 */
import { defineQuestionnaireElement } from './index.js';

defineQuestionnaireElement();
