import { isAnswer, type Answer } from '../kernel/answer.js';
import type { ItemPath } from '../kernel/path.js';
import type { ItemDef } from '../definition/compile.js';
import type { OptionStatus } from './options.js';
import { isRepeatingGroup, type ItemNode, type Store } from './store.js';

/**
 * ADR-0009 cycle step 1: guard. A refused command is a no-op cycle with a
 * reason, never a throw (`04-domain.md` §7.1): a host calling from plain
 * JavaScript with a malformed command gets a reason back too.
 */

/**
 * Everything a host can ask of a session. Each command runs as one cycle;
 * one that cannot apply is refused with a reason, never thrown.
 *
 * @beta
 */
export type Command =
  /** Replaces the node's answers (AC-02.1.1). More than one only on a repeating question. */
  | { readonly type: 'SetAnswer'; readonly path: ItemPath; readonly answers: readonly Answer[] }
  /** Removes every answer on the node. */
  | { readonly type: 'ClearAnswer'; readonly path: ItemPath }
  /** Appends an empty instance to the repeating group at `path` (AC-03.2.1). */
  | { readonly type: 'AddRepeatInstance'; readonly path: ItemPath }
  /** Destroys the instance with this ordinal and its answers (AC-03.2.2, AC-03.2.6). */
  | { readonly type: 'RemoveRepeatInstance'; readonly path: ItemPath; readonly ordinal: number }
  /** The respondent left the item: its issues surface (SM-03). */
  | { readonly type: 'NoteItemLeft'; readonly path: ItemPath }
  /** Completes the session, or is refused with `validation-errors` and surfaces every issue (SM-01). */
  | { readonly type: 'RequestCompletion' }
  /** Calls the resolver again for a value set whose resolution failed (SM-04, AC-07.1.2). */
  | { readonly type: 'RetryOptions'; readonly valueSet: string };

/**
 * Why a command was refused. A refusal changes nothing, except that a refused
 * completion surfaces every issue.
 *
 * @beta
 */
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
  | 'validation-errors'
  /* M4: a coded answer while the item's option set is not resolved (SM-04), `RetryOptions` for a set that has not failed */
  | 'options-unresolved'
  | 'options-not-failed'
  /* M4: a command sent while a rule, scorer or evaluator runs (ADR-0009), or to a disposed session */
  | 'collaborator-running'
  | 'disposed';

export function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const { type, path } = value as { type?: unknown; path?: unknown };
  if (type === 'RequestCompletion') return true;
  if (type === 'RetryOptions') return typeof (value as { valueSet?: unknown }).valueSet === 'string';
  if (typeof path !== 'string') return false;
  if (type === 'SetAnswer') return Array.isArray((value as { answers?: unknown }).answers);
  if (type === 'RemoveRepeatInstance') return Number.isSafeInteger((value as { ordinal?: unknown }).ordinal);
  return type === 'ClearAnswer' || type === 'NoteItemLeft' || type === 'AddRepeatInstance';
}

/** The node a command targets, or the reason it is refused. `options` is each value set's status. */
export function guard(
  store: Store,
  completed: boolean,
  command: Command,
  options: (valueSet: string) => OptionStatus | undefined,
): RefusalReason | ItemNode | null {
  if (completed) return 'session-completed';
  if (command.type === 'RequestCompletion') return null;
  if (command.type === 'RetryOptions') return options(command.valueSet) === 'failed' ? null : 'options-not-failed';
  const node = store.byPath.get(command.path);
  if (node === undefined) return 'unknown-path';
  if (!node.effective) return 'node-disabled';
  if (command.type === 'NoteItemLeft') return node;
  if (command.type === 'AddRepeatInstance' || command.type === 'RemoveRepeatInstance') return repeatRefusal(node, command) ?? node;
  if (node.def.accepts.length === 0) return 'not-answerable';
  if (node.def.calculated) return 'node-calculated';
  return command.type === 'SetAnswer' ? answersRefusal(node.def, command.answers, options) ?? node : node;
}

function answersRefusal(def: ItemDef, answers: readonly unknown[], options: (valueSet: string) => OptionStatus | undefined): RefusalReason | null {
  if (answers.length === 0) return 'empty-answers';
  if (answers.length > 1 && !def.repeats) return 'too-many-answers';
  if (!answers.every(isAnswer)) return 'invalid-answer';
  if (!answers.every((answer) => def.accepts.includes(answer.kind))) return 'type-mismatch';
  // SM-04: no coded answer until the options are known; `open-choice` text still goes in (AC-07.1.1).
  const unresolved = def.valueSet !== null && options(def.valueSet) !== 'resolved';
  return unresolved && answers.some((answer) => answer.kind === 'coding') ? 'options-unresolved' : null;
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
