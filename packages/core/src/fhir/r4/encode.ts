import type { Answer } from '../../kernel/answer.js';
import type { ResponseContent, ResponseItem } from '../../kernel/response.js';
import type { QuestionnaireResponse } from './types.js';

/**
 * Version-neutral response content in, R4 `QuestionnaireResponse` JSON out
 * (ADR-0016). Elements in R4's order; nothing is emitted that the content
 * does not hold, so an absent identity field stays absent (AC-05.1.2) and an
 * item with nothing under it is not written (INV-E-01).
 */

/** `answer.value[x]` by answer kind. */
const VALUE_KEYS: Readonly<Record<Answer['kind'], string>> = {
  boolean: 'valueBoolean',
  decimal: 'valueDecimal',
  integer: 'valueInteger',
  date: 'valueDate',
  dateTime: 'valueDateTime',
  string: 'valueString',
  coding: 'valueCoding',
  quantity: 'valueQuantity',
};

export function encodeResponse(content: ResponseContent, item: readonly object[] | undefined): QuestionnaireResponse {
  const identity = (content.identity ?? {}) as Readonly<Record<string, object | undefined>>;
  const { url, version } = content;
  return {
    resourceType: 'QuestionnaireResponse',
    ...present('identifier', identity['identifier']),
    ...present('questionnaire', url === null ? undefined : version === null ? url : `${url}|${version}`),
    status: content.status,
    ...present('subject', identity['subject']),
    ...present('encounter', identity['encounter']),
    authored: content.authored,
    ...present('author', identity['author']),
    ...present('item', item),
  };
}

export function encodeItems(items: readonly ResponseItem[]): readonly object[] | undefined {
  if (items.length === 0) return undefined;
  return items.map((item) =>
    Object.freeze({
      linkId: item.linkId,
      ...present('text', item.text === '' ? undefined : item.text),
      ...present('answer', item.answers.length === 0 ? undefined : item.answers.map((answer) => Object.freeze({ [VALUE_KEYS[answer.kind]]: answer.value }))),
      ...present('item', encodeItems(item.items)),
    }),
  );
}

function present<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}
