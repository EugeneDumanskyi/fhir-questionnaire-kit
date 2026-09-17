import { isAnswer, type Answer, type AnswerKind } from '../kernel/answer.js';
import type { ItemPath } from '../kernel/path.js';
import type { ItemDef } from '../definition/compile.js';
import type { ItemNode, Store } from './store.js';

/**
 * ADR-0009 cycle step 1: guard. A refused command is a no-op cycle with a
 * reason, never a throw (`04-domain.md` §7.1): a host calling from plain
 * JavaScript with a malformed command gets a reason back too.
 */

export type Command =
  | { readonly type: 'SetAnswer'; readonly path: ItemPath; readonly answers: readonly Answer[] }
  | { readonly type: 'ClearAnswer'; readonly path: ItemPath }
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
  return type === 'SetAnswer' ? Array.isArray((value as { answers?: unknown }).answers) : type === 'ClearAnswer' || type === 'NoteItemLeft';
}

/** The node a command targets, or the reason it is refused. */
export function guard(store: Store, completed: boolean, command: Command): RefusalReason | ItemNode | null {
  if (completed) return 'session-completed';
  if (command.type === 'RequestCompletion') return null;
  const node = store.byPath.get(command.path);
  if (node === undefined) return 'unknown-path';
  if (!node.effective) return 'node-disabled';
  if (command.type === 'NoteItemLeft') return node;
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
