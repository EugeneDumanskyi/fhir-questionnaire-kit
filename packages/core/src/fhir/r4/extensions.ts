import type { ExpressionKind } from '../../kernel/input.js';

/**
 * The HL7 and SDC extensions the kit reads, by their registered canonical
 * URLs. The kit defines none of its own (repository rule: no invented
 * extension URL, and no `fhirq` namespace without an ADR).
 */

const CORE = 'http://hl7.org/fhir/StructureDefinition/';
const SDC = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/';

export const MIN_OCCURS = `${CORE}questionnaire-minOccurs`;
export const MAX_OCCURS = `${CORE}questionnaire-maxOccurs`;
export const ITEM_CONTROL = `${CORE}questionnaire-itemControl`;
export const RENDERING_XHTML = `${CORE}rendering-xhtml`;

/** The code system of `questionnaire-itemControl` values. */
export const ITEM_CONTROL_SYSTEM = 'http://hl7.org/fhir/questionnaire-item-control';

/**
 * Every expression extension INV-D-15 names, and what it would do. Only
 * `calculatedExpression` has a seam (ADR-0017); the compiler decides what the
 * others cost in each load mode.
 */
export const EXPRESSION_EXTENSIONS: ReadonlyMap<string, ExpressionKind> = new Map([
  [`${SDC}sdc-questionnaire-calculatedExpression`, 'calculated'],
  [`${SDC}sdc-questionnaire-enableWhenExpression`, 'enableWhen'],
  [`${SDC}sdc-questionnaire-answerExpression`, 'answer'],
  [`${SDC}sdc-questionnaire-candidateExpression`, 'candidate'],
  [`${SDC}sdc-questionnaire-initialExpression`, 'initial'],
  [`${CORE}variable`, 'variable'],
  [`${SDC}sdc-questionnaire-launchContext`, 'launchContext'],
]);
