import type { Answer, ItemDefinition, ItemType, SessionState } from '../index.js';
import { sameAnswer } from '../kernel/answer.js';
import type { ControlKind, ViewNode } from './types.js';

/**
 * Control choice (INV-P-05, AC-01.2.2, M5 plan D2). A hint is honoured only
 * where it fits the item: `check-box` on a choice that repeats, `radio-button`
 * and `drop-down` on one that does not. Any other hint, or one that does not
 * fit, falls back to the count rule: up to 5 options are all shown, more are
 * a list. The view has no diagnostic channel, so a fallback is silent; the
 * conformance matrix records it.
 */
export function controlKind(item: ItemDefinition, optionCount: number): ControlKind {
  const { type, repeats, itemControl } = item;
  if (type === null) return 'unsupported';
  if (item.calculated) return 'calculated';
  if (type === 'group') return repeats ? 'repeating-group' : 'group';
  const plain = PLAIN[type];
  if (plain !== undefined) return plain;
  if (repeats) return itemControl === 'check-box' || optionCount <= 5 ? 'multi-choice' : 'multi-list';
  if (itemControl === 'radio-button') return 'single-choice';
  if (itemControl === 'drop-down') return 'single-menu';
  return optionCount <= 5 ? 'single-choice' : 'single-list';
}

/** The item types whose control follows from the type alone. */
const PLAIN: Partial<Readonly<Record<ItemType, ControlKind>>> = {
  display: 'statement',
  boolean: 'yes-no',
  string: 'short-text',
  text: 'long-text',
  integer: 'integer',
  decimal: 'decimal',
  date: 'calendar-date',
  dateTime: 'date-time',
  quantity: 'quantity',
};

/** The kinds that take options. */
export const isChoice = (kind: ControlKind): boolean => kind.startsWith('single-') || kind.startsWith('multi-');

/**
 * An item's options and SM-04 state: inline options are ready; a value set's
 * are its resolved codings, or none while it is pending, failed or unresolved.
 */
export function optionsOf(item: ItemDefinition, sets: SessionState['optionSets']): {
  readonly answers: readonly Answer[];
  readonly state: Extract<ViewNode, { readonly optionState: unknown }>['optionState'];
} {
  if (item.valueSet === null) return { answers: item.options, state: 'ready' };
  const entry = sets[item.valueSet];
  const status = entry?.status;
  return {
    answers: entry !== undefined && status === 'resolved' ? entry.options.map((value): Answer => ({ kind: 'coding', value })) : [],
    state: status === 'resolved' ? 'ready' : status === 'pending' || status === 'failed' ? status : 'unavailable',
  };
}

/** Whether an answer is this option: a coding by `system` and `code` (M2 plan D3), or by `display` when it has no code; anything else exactly. */
export function sameChoice(answer: Answer, option: Answer): boolean {
  if (answer.kind !== 'coding' || option.kind !== 'coding') return sameAnswer(answer, option);
  const { system, code, display } = answer.value;
  return system === option.value.system && code === option.value.code && (code !== undefined || display === option.value.display);
}
