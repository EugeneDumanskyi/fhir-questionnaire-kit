import { itemPath, type Answer, type Questionnaire } from '../src/index.js';

/** The S1 slice (06-roadmap.md §3, M1), as the R4 Questionnaire it now loads from: a boolean that gates a required string. */
export const SLICE = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [
    { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
    {
      linkId: 'amount',
      type: 'string',
      text: 'How much do you smoke per day?',
      required: true,
      enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }],
    },
  ],
} as const satisfies Questionnaire;

export const SMOKER = itemPath('smoker');
export const AMOUNT = itemPath('amount');

export const bool = (value: boolean): readonly Answer[] => [{ kind: 'boolean', value }];
export const text = (value: string): readonly Answer[] => [{ kind: 'string', value }];

/** An R4 Questionnaire around the given items. */
export const questionnaire = (item: Questionnaire['item']): Questionnaire => ({ resourceType: 'Questionnaire', status: 'draft', ...(item === undefined ? {} : { item }) });
