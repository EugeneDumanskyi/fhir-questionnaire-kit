// MUST FAIL (4): an R4 shape outside the codec, declared and read.
interface Resource {
  readonly resourceType: string;
}

export const questionnaire = { resourceType: 'Questionnaire', item: [] };
export const quoted = { 'resourceType': 'QuestionnaireResponse' };
export const isResource = (value: Resource): boolean => value.resourceType === 'Questionnaire';
