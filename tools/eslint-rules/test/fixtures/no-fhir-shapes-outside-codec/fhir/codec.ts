// ALLOWED: the codec is where R4 shapes live.
export const isQuestionnaire = (value: { readonly resourceType?: unknown }): boolean =>
  value.resourceType === 'Questionnaire';
