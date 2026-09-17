import { isAnswer, type Answer, type AnswerKind } from '../kernel/answer.js';
import type { ItemPath } from '../kernel/path.js';
import type { ItemDef } from '../definition/compile.js';
import { isRepeatingGroup, type ItemNode, type Store } from './store.js';

/**
 * ADR-0009 cycle step 1: guard. A refused command is a no-op cycle with a
 * reason, never a throw (`04-domain.md` §7.1): a host calling from plain
 * JavaScript with a malformed command gets a reason back too.
 */

export type Command =
  | { readonly type: 'SetAnswer'; readonly path: ItemPath; readonly answers: readonly Answer[] }
  | { readonly type: 'ClearAnswer'; readonly path: ItemPath }
  /** Appends an empty instance to the repeating group at `path` (AC-03.2.1). */
  | { readonly type: 'AddRepeatInstance'; readonly path: ItemPath }
  /** Destroys the instance with this ordinal and its answers (AC-03.2.2, AC-03.2.6). */
  | { readonly type: 'RemoveRepeatInstance'; readonly path: ItemPath; readonly ordinal: number }
  | { readonly type: 'NoteItemLeft'; readonly path: ItemPath }
  | { readonly type: 'RequestCompletion' };

export type RefusalReason =
  | 'malformed-command'
  | 'unknown-path'
  | 'session-completed'
  | 'node-disabled'
  | 'node-calculated'
  | 'not-answerable'
  | 'empty-answers'
  | 'too-many-answers'
  | 'invalid-answer'
  | 'type-mismatch'
  | 'not-repeating'
  | 'at-max-occurs'
  | 'unknown-instance'
  | 'validation-errors';

/** What each item type accepts (INV-S-10). A choice accepts the kinds its options have. */
function acceptedKinds(def: ItemDef): readonly AnswerKind[] {
  switch (def.type) {
    case 'choice':
      return optionKinds(def);
    case 'open-choice':
      return [...optionKinds(def), 'string'];
    case 'text':
      return ['string'];
    case 'group':
    case 'display':
    case null:
      return [];
    default:
      return [def.type];
  }
}

function optionKinds(def: ItemDef): AnswerKind[] {
  return def.options.length === 0 ? ['coding'] : [...new Set(def.options.map((option) => option.kind))];
}

export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const { type, path } = value as { type?: unknown; path?: unknown };
  if (type === 'RequestCompletion') return true;
  if (typeof path !== 'string') return false;
  if (type === 'SetAnswer') return Array.isArray((value as { answers?: unknown }).answers);
  if (type === 'RemoveRepeatInstance') return Number.isSafeInteger((value as { ordinal?: unknown }).ordinal);
  return type === 'ClearAnswer' || type === 'NoteItemLeft' || type === 'AddRepeatInstance';
}

/** The node a command targets, or the reason it is refused. */
export function guard(store: Store, completed: boolean, command: Command): RefusalReason | ItemNode | null {
  if (completed) return 'session-completed';
  if (command.type === 'RequestCompletion') return null;
  const node = store.byPath.get(command.path);
  if (node === undefined) return 'unknown-path';
  if (!node.effective) return 'node-disabled';
  if (command.type === 'NoteItemLeft') return node;
  if (command.type === 'AddRepeatInstance' || command.type === 'RemoveRepeatInstance') return repeatRefusal(node, command) ?? node;
  if (acceptedKinds(node.def).length === 0) return 'not-answerable';
  if (node.def.calculated) return 'node-calculated';
  return command.type === 'SetAnswer' ? answersRefusal(node.def, command.answers) ?? node : node;
}

function answersRefusal(def: ItemDef, answers: readonly unknown[]): RefusalReason | null {
  if (answers.length === 0) return 'empty-answers';
  if (answers.length > 1 && !def.repeats) return 'too-many-answers';
  if (!answers.every(isAnswer)) return 'invalid-answer';
  const accepted = acceptedKinds(def);
  return answers.every((answer) => accepted.includes(answer.kind)) ? null : 'type-mismatch';
}

/**
 * SM-05. `Add` is refused at or over `maxOccurs` (INV-S-22, including the
 * `OverMax` that stored data can reach); `Remove` is never refused on
 * cardinality, only for an ordinal that is not live (INV-S-23).
 */
function repeatRefusal(
  node: ItemNode,
  command: Extract<Command, { type: 'AddRepeatInstance' | 'RemoveRepeatInstance' }>,
): RefusalReason | null {
  if (!isRepeatingGroup(node.def)) return 'not-repeating';
  if (command.type === 'RemoveRepeatInstance') {
    return node.instances.some((instance) => instance.ordinal === command.ordinal) ? null : 'unknown-instance';
  }
  const { maxOccurs } = node.def;
  return maxOccurs !== null && node.instances.length >= maxOccurs ? 'at-max-occurs' : null;
}
