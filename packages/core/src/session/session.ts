import type { AnswerValue } from '../kernel/answer.js';
import type { Issue } from '../kernel/issue.js';
import { itemPath, type ItemPath } from '../kernel/path.js';
import type { Definition, ItemDefinition } from '../definition/definition.js';
import type { Validator, VisibleNode, VisibleProjection } from './projection.js';

/** Commands into BC2 (`04-domain.md` §7.1) that the slice needs. */
export type Command =
  | { readonly type: 'SetAnswer'; readonly path: ItemPath; readonly value: AnswerValue }
  | { readonly type: 'ClearAnswer'; readonly path: ItemPath }
  | { readonly type: 'NoteItemLeft'; readonly path: ItemPath }
  | { readonly type: 'RequestCompletion' };

export type RefusalReason =
  | 'unknown-path'
  | 'node-disabled'
  | 'session-completed'
  | 'type-mismatch'
  | 'empty-value'
  | 'validation-errors';

/**
 * A refused command is a no-op cycle with a reason, never a throw. The one
 * exception to "no-op" is `validation-errors`: a refused completion surfaces
 * every issue (SM-01), so it changes state and notifies.
 */
export type CommandResult =
  | { readonly outcome: 'applied' | 'unchanged' | 'deferred' }
  | { readonly outcome: 'refused'; readonly reason: RefusalReason };

/** A visible node. Object identity is kept across cycles while nothing about it changed. */
export interface NodeState {
  readonly path: ItemPath;
  readonly item: ItemDefinition;
  readonly answer: AnswerValue | undefined;
  /** Every current issue, surfaced or not. */
  readonly issues: readonly Issue[];
  /** SM-03: `true` once *Live*, and never back. */
  readonly surfaced: boolean;
}

/** What one cycle did. Paths and flags only, never values (NFR-X-04). */
export interface SessionChange {
  readonly command: Command['type'];
  readonly enabled: readonly ItemPath[];
  readonly disabled: readonly ItemPath[];
  readonly surfaced: readonly ItemPath[];
  readonly completion: 'refused' | 'completed' | null;
  readonly responseChanged: boolean;
}

export interface SessionState {
  readonly status: 'in-progress' | 'completed';
  /** Increments once per cycle that changed anything visible. */
  readonly cycle: number;
  /** Effectively enabled nodes only, in document order. */
  readonly nodes: readonly NodeState[];
  readonly completionRefused: boolean;
  /** The cycle that produced this state; `null` for the initial state. */
  readonly change: SessionChange | null;
}

export interface Diagnostic {
  readonly code: 'listener-threw';
}

/**
 * The response session. `getSnapshot` returns the same reference until a
 * cycle changes something visible, which is what `useSyncExternalStore` needs.
 *
 * @alpha S1 spike surface.
 */
export interface Session {
  subscribe(listener: (change: SessionChange) => void): () => void;
  getSnapshot(): SessionState;
  dispatch(command: Command): CommandResult;
  readonly diagnostics: readonly Diagnostic[];
}

interface Settled {
  readonly enabled: ReadonlySet<ItemPath>;
  readonly projection: VisibleProjection;
  readonly issues: readonly Issue[];
}

const NO_ISSUES: readonly Issue[] = [];
const NO_PATHS: readonly ItemPath[] = [];

/**
 * The slice's session: a naive full pass settles enablement on every cycle.
 * No dependency graph and no recompute set; both are M2 (ADR-0009).
 */
export function createResponseSession(definition: Definition, validate: Validator): Session {
  const answers = new Map<ItemPath, AnswerValue>();
  const live = new Set<ItemPath>();
  const listeners = new Set<(change: SessionChange) => void>();
  const diagnostics: Diagnostic[] = [];
  const queue: Command[] = [];
  let running = false;
  let status: SessionState['status'] = 'in-progress';
  let completionRefused = false;

  const settle = (): Settled => {
    const enabled = settleEnablement(definition, answers);
    const nodes = definition.items
      .filter((item) => enabled.has(item.path))
      .map((item): VisibleNode => ({ path: item.path, item, answer: answers.get(item.path) }));
    const projection = { nodes };
    return { enabled, projection, issues: validate(projection) };
  };

  let settled = settle();
  let state: SessionState = {
    status,
    cycle: 0,
    nodes: buildNodes(settled, [], live),
    completionRefused,
    change: null,
  };

  const refusalFor = (command: Command): RefusalReason | null => {
    if (status === 'completed') return 'session-completed';
    if (command.type === 'RequestCompletion') return null;
    const item = definition.byPath.get(command.path);
    if (item === undefined) return 'unknown-path';
    if (!settled.enabled.has(command.path)) return 'node-disabled';
    if (command.type !== 'SetAnswer') return null;
    if (typeof command.value !== item.type) return 'type-mismatch';
    return command.value === '' ? 'empty-value' : null;
  };

  const surface = (next: Settled, paths: readonly ItemPath[]): ItemPath[] => {
    const withIssues = new Set(next.issues.map((issue) => issue.path));
    const surfaced = paths.filter((path) => withIssues.has(path) && !live.has(path));
    for (const path of surfaced) live.add(path);
    return surfaced;
  };

  const run = (command: Command): CommandResult => {
    const refusal = refusalFor(command);
    if (refusal !== null) return { outcome: 'refused', reason: refusal };

    if (command.type === 'SetAnswer') answers.set(command.path, command.value);
    if (command.type === 'ClearAnswer') answers.delete(command.path);
    const next = settle();

    let completion: SessionChange['completion'] = null;
    let surfaced: ItemPath[] = [];
    if (command.type === 'NoteItemLeft') surfaced = surface(next, [command.path]);
    if (command.type === 'RequestCompletion') {
      const errors = next.issues.filter((issue) => issue.severity === 'error');
      completion = errors.length > 0 ? 'refused' : 'completed';
      if (completion === 'refused') {
        completionRefused = true;
        surfaced = surface(next, errors.map((issue) => issue.path));
      } else {
        status = 'completed';
      }
    }

    const nodes = buildNodes(next, state.nodes, live);
    const previous = settled;
    settled = next;
    if (nodes === state.nodes && completion === null) return { outcome: 'unchanged' };

    const change: SessionChange = {
      command: command.type,
      enabled: definition.items.filter((i) => next.enabled.has(i.path) && !previous.enabled.has(i.path)).map((i) => i.path),
      disabled: definition.items.filter((i) => !next.enabled.has(i.path) && previous.enabled.has(i.path)).map((i) => i.path),
      surfaced: surfaced.length > 0 ? surfaced : NO_PATHS,
      completion,
      responseChanged: !sameAnswers(previous.projection, next.projection),
    };
    state = { status, cycle: state.cycle + 1, nodes, completionRefused, change };
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch {
        // A throwing host collaborator becomes a diagnostic, never a failed cycle.
        diagnostics.push({ code: 'listener-threw' });
      }
    }
    return completion === 'refused' ? { outcome: 'refused', reason: 'validation-errors' } : { outcome: 'applied' };
  };

  return {
    diagnostics,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    dispatch(command) {
      // Single writer: a command issued while a cycle runs (from a listener)
      // waits for that cycle to finish and gets its own cycle.
      if (running) {
        queue.push(command);
        return { outcome: 'deferred' };
      }
      running = true;
      try {
        const result = run(command);
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) run(next);
        return result;
      } finally {
        running = false;
        queue.length = 0;
      }
    },
  };
}

/**
 * Jacobi iteration to a fixed point: each pass reads the previous pass's
 * enablement as a whole, so the result does not depend on declaration order
 * (INV-S-06). Conditions read only enabled nodes' answers (INV-S-04).
 */
function settleEnablement(definition: Definition, answers: ReadonlyMap<ItemPath, AnswerValue>): ReadonlySet<ItemPath> {
  let enabled: ReadonlySet<ItemPath> = new Set(definition.items.map((item) => item.path));
  for (let pass = 0; pass <= definition.items.length; pass += 1) {
    const current = enabled;
    const next = new Set(definition.items.filter((item) => ownCondition(item, answers, current)).map((item) => item.path));
    if (next.size === current.size && [...next].every((path) => current.has(path))) return next;
    enabled = next;
  }
  return enabled;
}

function ownCondition(
  item: ItemDefinition,
  answers: ReadonlyMap<ItemPath, AnswerValue>,
  enabled: ReadonlySet<ItemPath>,
): boolean {
  if (item.conditions.length === 0) return true;
  const met = item.conditions.map((condition) => {
    const target = itemPath(condition.question);
    return enabled.has(target) && answers.get(target) === condition.answer;
  });
  return item.behavior === 'all' ? met.every(Boolean) : met.some(Boolean);
}

/** Builds the visible nodes, reusing the previous object for any node that did not change. */
function buildNodes(next: Settled, previous: readonly NodeState[], live: ReadonlySet<ItemPath>): readonly NodeState[] {
  const byPath = new Map(previous.map((node) => [node.path, node]));
  let reused = next.projection.nodes.length === previous.length;
  const nodes = next.projection.nodes.map((visible, index) => {
    const issues = next.issues.filter((issue) => issue.path === visible.path);
    const surfaced = live.has(visible.path);
    const old = byPath.get(visible.path);
    if (old !== undefined && old.answer === visible.answer && old.surfaced === surfaced && sameIssues(old.issues, issues)) {
      if (previous[index] !== old) reused = false;
      return old;
    }
    reused = false;
    return { path: visible.path, item: visible.item, answer: visible.answer, issues: issues.length > 0 ? issues : NO_ISSUES, surfaced };
  });
  return reused ? previous : nodes;
}

function sameIssues(a: readonly Issue[], b: readonly Issue[]): boolean {
  return a.length === b.length && a.every((issue, index) => issue.code === b[index]?.code);
}

function sameAnswers(a: VisibleProjection, b: VisibleProjection): boolean {
  return (
    a.nodes.length === b.nodes.length &&
    a.nodes.every((node, index) => node.path === b.nodes[index]?.path && node.answer === b.nodes[index]?.answer)
  );
}
