import type { Questionnaire } from '@fhirq/core';

import { questionnaire } from '../../core/test/slice.js';

const CORE = 'http://hl7.org/fhir/StructureDefinition/';
const unit = (code: string) => ({ url: `${CORE}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code, display: code } });

/**
 * Every kind the element builds so far (M7 plan step 3b), for its client tests
 * and its browser page: each entry kind, a repeating question, both unit
 * forms, `yes-no`, a required group, and a required repeating group of at
 * most two with one nested inside it. Step 4 adds the option and read-only kinds.
 */
export const KINDS: Questionnaire = questionnaire([
  { linkId: 'name', type: 'string', text: 'Name', required: true },
  { linkId: 'notes', type: 'text', text: 'Notes' },
  { linkId: 'age', type: 'integer', text: 'Age' },
  { linkId: 'height', type: 'decimal', text: 'Height' },
  { linkId: 'born', type: 'date', text: 'Born' },
  { linkId: 'seen', type: 'dateTime', text: 'Seen' },
  { linkId: 'weight', type: 'quantity', text: 'Weight', extension: [unit('kg'), unit('[lb_av]')] },
  { linkId: 'dose', type: 'quantity', text: 'Dose' },
  { linkId: 'aliases', type: 'string', text: 'Other names', repeats: true },
  { linkId: 'smoker', type: 'boolean', text: 'Smoker' },
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
    required: true,
    repeats: true,
    extension: [{ url: `${CORE}questionnaire-maxOccurs`, valueInteger: 2 }],
    item: [
      { linkId: 'med-name', type: 'string', text: 'Medicine name' },
      { linkId: 'times', type: 'group', text: 'Time', repeats: true, item: [{ linkId: 'time', type: 'string', text: 'When' }] },
    ],
  },
]);
