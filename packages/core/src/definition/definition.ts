import type { AnswerValue } from '../kernel/answer.js';
import { FhirqError } from '../kernel/error.js';
import { itemPath, type ItemPath } from '../kernel/path.js';

export type ItemType = 'boolean' | 'string';

/** One `enableWhen`. The slice supports the `=` operator only. */
export interface ConditionInput {
  readonly question: string;
  readonly operator: '=';
  readonly answer: AnswerValue;
}

export interface ItemInput {
  readonly linkId: string;
  readonly type: ItemType;
  readonly text: string;
  readonly required?: boolean;
  readonly enableWhen?: readonly ConditionInput[];
  readonly enableBehavior?: 'all' | 'any';
}

/**
 * Version-neutral questionnaire input (ADR-0016). M2's R4 codec produces it;
 * in the slice it is built by hand.
 *
 * @alpha S1 spike surface.
 */
export interface DefinitionInput {
  readonly items: readonly ItemInput[];
}

export interface ItemDefinition {
  readonly linkId: string;
  readonly path: ItemPath;
  readonly type: ItemType;
  readonly text: string;
  readonly required: boolean;
  readonly conditions: readonly ConditionInput[];
  readonly behavior: 'all' | 'any';
}

export interface Definition {
  readonly items: readonly ItemDefinition[];
  readonly byPath: ReadonlyMap<ItemPath, ItemDefinition>;
}

const TYPE_OF_ANSWER: Readonly<Record<ItemType, string>> = { boolean: 'boolean', string: 'string' };

/**
 * Checks and freezes the input. A defect rejects the load with a typed error
 * naming the `linkId`, which is strict mode's behaviour (`04-domain.md` SM-01).
 * Cycle detection and the rest of INV-D-* are M2.
 */
export function buildDefinition(input: DefinitionInput): Definition {
  const byLinkId = new Map<string, ItemInput>();
  for (const item of input.items) {
    if (byLinkId.has(item.linkId)) throw new FhirqError('definition-rejected', item.linkId);
    byLinkId.set(item.linkId, item);
  }

  const items = input.items.map((item): ItemDefinition => {
    const conditions = item.enableWhen ?? [];
    for (const condition of conditions) {
      const target = byLinkId.get(condition.question);
      const mismatched = target !== undefined && typeof condition.answer !== TYPE_OF_ANSWER[target.type];
      if (target === undefined || target === item || mismatched) {
        throw new FhirqError('definition-rejected', item.linkId);
      }
    }
    return {
      linkId: item.linkId,
      path: itemPath(item.linkId),
      type: item.type,
      text: item.text,
      required: item.required ?? false,
      conditions,
      behavior: item.enableBehavior ?? 'all',
    };
  });

  return { items, byPath: new Map(items.map((item) => [item.path, item])) };
}
