import type { Questionnaire } from '@fhirq/core';

/**
 * The questionnaires the examples run over: small, and each shaped for the one
 * example that reads it. None is for clinical use.
 */

const SDC = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/';

export const smoking: Questionnaire = {
  resourceType: 'Questionnaire',
  url: 'urn:fhirq:docs:smoking',
  version: '1',
  status: 'draft',
  item: [
    { linkId: 'smoker', text: 'Do you smoke?', type: 'boolean', required: true },
    {
      linkId: 'per-day',
      text: 'Cigarettes a day',
      type: 'integer',
      enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }],
    },
  ],
};

export const bloodPressure: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [
    { linkId: 'systolic', text: 'Systolic (mmHg)', type: 'integer' },
    { linkId: 'diastolic', text: 'Diastolic (mmHg)', type: 'integer' },
  ],
};

export const collaborating: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [
    {
      linkId: 'q1',
      text: 'Little interest or pleasure in doing things',
      _text: { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/rendering-xhtml', valueString: '<b>Little</b> interest or pleasure in doing things' }] },
      type: 'choice',
      answerValueSet: 'urn:fhirq:docs:frequency',
    },
    { linkId: 'q2', text: 'Feeling down, depressed or hopeless', type: 'choice', answerValueSet: 'urn:fhirq:docs:frequency' },
    {
      linkId: 'total',
      text: 'Total',
      type: 'integer',
      extension: [
        {
          url: `${SDC}sdc-questionnaire-calculatedExpression`,
          valueExpression: { language: 'text/fhirpath', expression: "%resource.repeat(item).where(linkId='q1' or linkId='q2').answer.value.count()" },
        },
      ],
    },
  ],
};
