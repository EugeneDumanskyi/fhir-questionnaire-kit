import type { Answer } from '../../src/kernel/answer.js';
import type { ConditionInput, DefinitionInput, ExpressionUse, ItemInput } from '../../src/kernel/input.js';
import type { ItemType, Operator } from '../../src/kernel/item-type.js';

/**
 * Builders for version-neutral input, which ADR-0016 lets engine tests use in
 * place of R4 JSON. Defaults are what an author who wrote nothing would get.
 */
export function item(linkId: string, type: ItemType | null, extra: Partial<ItemInput> = {}): ItemInput {
  return {
    linkId,
    type,
    authoredType: type ?? 'attachment',
    text: '',
    required: false,
    repeats: false,
    children: [],
    enableWhen: [],
    enableBehavior: null,
    options: [],
    valueSet: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    maxDecimalPlaces: null,
    minOccurs: null,
    maxOccurs: null,
    itemControl: null,
    renderingXhtml: null,
    expressions: [],
    hasInitial: false,
    ...extra,
  };
}

export const group = (linkId: string, children: readonly ItemInput[], extra: Partial<ItemInput> = {}): ItemInput =>
  item(linkId, 'group', { children, ...extra });

export const repeating = (linkId: string, children: readonly ItemInput[], extra: Partial<ItemInput> = {}): ItemInput =>
  group(linkId, children, { repeats: true, ...extra });

export function when(question: string, operator: Operator, answer: Answer | null): ConditionInput {
  return { question, operator, answer, answerType: answer === null ? 'Time' : answer.kind };
}

export const yes: Answer = { kind: 'boolean', value: true };

export function expression(kind: ExpressionUse['kind']): ExpressionUse {
  return { kind, url: `urn:extension:${kind}`, language: 'text/fhirpath', expression: '1', name: null };
}

export function definition(items: readonly ItemInput[], extra: Partial<DefinitionInput> = {}): DefinitionInput {
  return { url: null, version: null, items, expressions: [], ...extra };
}
