import { itemPath, type DefinitionInput } from '../src/index.js';

/** The S1 slice (06-roadmap.md §3, M1): a boolean that gates a required string. */
export const SLICE: DefinitionInput = {
  items: [
    { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
    {
      linkId: 'amount',
      type: 'string',
      text: 'How much do you smoke per day?',
      required: true,
      enableWhen: [{ question: 'smoker', operator: '=', answer: true }],
    },
  ],
};

export const SMOKER = itemPath('smoker');
export const AMOUNT = itemPath('amount');
