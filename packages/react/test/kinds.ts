import type { Questionnaire, SessionOptions } from '@fhirq/core';

const CORE = 'http://hl7.org/fhir/StructureDefinition/';
const CONTROL = 'http://hl7.org/fhir/questionnaire-item-control';

const hint = (code: string) => ({ url: `${CORE}questionnaire-itemControl`, valueCodeableConcept: { coding: [{ system: CONTROL, code }] } });
const options = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ valueCoding: { system: 'urn:test', code: `o${i + 1}`, display: `Option ${i + 1}` } }));
const unit = (code: string) => ({ url: `${CORE}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code, display: code } });

export const KINDS_VS = 'http://example.org/fhir/ValueSet/kinds';

/**
 * Every control kind of the view (INV-P-05) and every row of the DOM
 * contract (docs/08-dom-contract.md §3): a repeating question, both unit
 * forms, a value set, an open choice, a rich label, a group and a repeating
 * group with one nested inside it. Lenient, so the attachment degrades to
 * `unsupported` and the calculated item needs no evaluator (AC-01.3.2).
 */
export const KINDS = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [
    { linkId: 'intro', type: 'display', text: 'About you', _text: { extension: [{ url: `${CORE}rendering-xhtml`, valueString: '<b>About</b> you' }] } },
    { linkId: 'name', type: 'string', text: 'Name', required: true, _text: { extension: [{ url: `${CORE}rendering-xhtml`, valueString: '<i>Name</i>' }] } },
    { linkId: 'notes', type: 'text', text: 'Notes' },
    { linkId: 'age', type: 'integer', text: 'Age' },
    { linkId: 'height', type: 'decimal', text: 'Height' },
    { linkId: 'born', type: 'date', text: 'Born' },
    { linkId: 'seen', type: 'dateTime', text: 'Seen' },
    { linkId: 'weight', type: 'quantity', text: 'Weight', extension: [unit('kg'), unit('[lb_av]')] },
    { linkId: 'dose', type: 'quantity', text: 'Dose' },
    { linkId: 'aliases', type: 'string', text: 'Other names', repeats: true },
    { linkId: 'smoker', type: 'boolean', text: 'Smoker' },
    { linkId: 'colour', type: 'choice', text: 'Colour', required: true, answerOption: options(3) },
    { linkId: 'country', type: 'choice', text: 'Country', answerOption: options(7) },
    { linkId: 'size', type: 'choice', text: 'Size', answerOption: options(3), extension: [hint('drop-down')] },
    { linkId: 'pets', type: 'choice', text: 'Pets', repeats: true, answerOption: options(3) },
    { linkId: 'foods', type: 'choice', text: 'Foods', repeats: true, answerOption: options(7) },
    { linkId: 'route', type: 'open-choice', text: 'Route', answerOption: options(2) },
    { linkId: 'coded', type: 'choice', text: 'Coded', answerValueSet: KINDS_VS },
    {
      linkId: 'score',
      type: 'integer',
      text: 'Score',
      extension: [{ url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression', valueExpression: { language: 'text/fhirpath', expression: '1' } }],
    },
    { linkId: 'file', type: 'attachment', text: 'Upload' },
    {
      linkId: 'address',
      type: 'group',
      text: 'Address',
      required: true,
      item: [
        { linkId: 'street', type: 'string', text: 'Street' },
        { linkId: 'city', type: 'string', text: 'City' },
      ],
    },
    {
      linkId: 'meds',
      type: 'group',
      text: 'Medicine',
      repeats: true,
      extension: [{ url: `${CORE}questionnaire-maxOccurs`, valueInteger: 2 }],
      item: [
        { linkId: 'med-name', type: 'string', text: 'Medicine name' },
        { linkId: 'times', type: 'group', text: 'Time', repeats: true, item: [{ linkId: 'time', type: 'string', text: 'When' }] },
      ],
    },
  ],
} as const satisfies Questionnaire;

/** Lenient, with a sanitizer that keeps the markup as authored: the test's own, never a real one. */
export const KINDS_OPTIONS = { loadMode: 'lenient', sanitize: (xhtml: string) => xhtml } as const satisfies SessionOptions;
