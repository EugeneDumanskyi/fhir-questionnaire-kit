/**
 * The questionnaire the quickstart renders: FHIR R4 JSON, held in a module
 * `as const` so `resourceType` keeps its literal type. Imported from a `.json`
 * file, TypeScript widens it to `string` and the prop does not accept it; a
 * questionnaire fetched at runtime needs neither.
 */
export const intake = {
  resourceType: 'Questionnaire',
  title: 'New patient intake (demonstration)',
  status: 'draft',
  item: [
    { linkId: 'notice', text: 'This is a demonstration form. It is not for clinical use.', type: 'display' },
    { linkId: 'name', text: 'Full name', type: 'string', required: true },
    { linkId: 'born', text: 'Date of birth', type: 'date', required: true },
    { linkId: 'smoker', text: 'Do you smoke?', type: 'boolean', required: true },
    {
      linkId: 'per-day',
      text: 'Cigarettes a day',
      type: 'integer',
      required: true,
      enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }],
    },
    {
      linkId: 'contact',
      text: 'How should we contact you?',
      type: 'choice',
      answerOption: [{ valueString: 'Phone' }, { valueString: 'Email' }, { valueString: 'Post' }],
    },
  ],
} as const;
