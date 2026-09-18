import { copyAnswer, sameAnswer } from '../kernel/answer.js';
import { diagnostic, type Diagnostic } from '../kernel/diagnostic.js';
import { slot } from '../kernel/dense.js';
import type { Issue } from '../kernel/issue.js';
import type { ItemPath } from '../kernel/path.js';
import type { Definition } from '../definition/compile.js';
import { settle, settleInitial, type RetentionPolicy } from './enablement.js';
import { guard, isCommand, type Command, type RefusalReason } from './guard.js';
import { publishProjection, type Validator } from './projection.js';
import { project, publicItem, publishNodes, type NodeState } from './publish.js';
import { register } from './registry.js';
import {
  addInstance,
  createStore,
  dependentNodes,
  inDocumentOrder,
  removeInstance,
  subtree,
  type ItemNode,
  type Store,
} from './store.js';
import { recordTrace } from './trace.js';

/**
 * The response session (BC2, ADR-0009): one command, one cycle, at most one
 * notification. A cycle guards, applies, settles enablement incrementally,
 * validates the visible projection, surfaces (SM-03), publishes per-node
 * objects and the projection emission reads, and notifies.
 * No observer ever sees a cycle in progress (INV-S-05); a command issued
 * during one waits for it and gets a cycle of its own.
 */

/**
 * A refused command is a no-op cycle with a reason, never a throw. The one
 * refusal that changes state is `validation-errors`: a refused completion
 * surfaces every issue (SM-01), so it notifies.
 *
 * @beta
 */
export type CommandResult =
  | { readonly outcome: 'applied' | 'unchanged' | 'deferred' }
  | { readonly outcome: 'refused'; readonly reason: RefusalReason };

/**
 * What one cycle did: paths and flags only, never values (NFR-X-04).
 *
 * @beta
 */
export interface SessionChange {
  readonly command: Command['type'];
  /** Nodes that became effectively enabled, in document order. */
  readonly enabled: readonly ItemPath[];
  /** Nodes that became disabled, in document order. */
  readonly disabled: readonly ItemPath[];
  readonly surfaced: readonly ItemPath[];
  /** Repeat instances this cycle added and removed, by instance path (`meds[2]`). */
  readonly added: readonly ItemPath[];
  readonly removed: readonly ItemPath[];
  readonly completion: 'refused' | 'completed' | null;
  /** Whether the emitted response would differ: an answer on an enabled node changed, appeared or disappeared. */
  readonly responseChanged: boolean;
}

/**
 * One immutable snapshot. A new object only when a cycle changed something
 * visible.
 *
 * @beta
 */
export interface SessionState {
  /** `completed` is final (AC-05.1.4). */
  readonly status: 'in-progress' | 'completed';
  /** Increments once per cycle that changed anything visible. */
  readonly cycle: number;
  /** Effectively enabled nodes only, in document order. */
  readonly nodes: readonly NodeState[];
  /**
   * The validation result (AC-04.4.1): every current issue, surfaced or not,
   * form-level first, then in document order and repeat position (INV-V-06).
   * Serializable, and never an answer value.
   */
  readonly issues: readonly Issue[];
  /** Whether a completion has been refused: every issue on a node is surfaced then, and form-level issues are shown. */
  readonly completionRefused: boolean;
  /** The cycle that produced this state; `null` for the initial state. */
  readonly change: SessionChange | null;
}

/**
 * The store contract `useSyncExternalStore` needs: `getSnapshot` returns the
 * same reference until a cycle changes something visible.
 *
 * @beta
 */
export interface Session {
  /** Called once per cycle that changed something visible. Returns the unsubscribe function. A listener that throws becomes a diagnostic. */
  readonly subscribe: (listener: (change: SessionChange) => void) => () => void;
  /** The current snapshot; the same reference until a cycle changes something visible. */
  readonly getSnapshot: () => SessionState;
  /** Runs the command as one cycle. A command sent from a listener is `deferred` and runs in its own cycle straight after. */
  readonly dispatch: (command: Command) => CommandResult;
  /** Load findings, then runtime ones as they happen. */
  readonly diagnostics: readonly Diagnostic[];
}

export interface SessionSettings {
  readonly retention: RetentionPolicy;
  /** Stored verbatim for emission; the session never reads or invents it (INV-S-32). */
  readonly hostIdentity: object | null;
}

/**
 * Stored state to start from instead of a fresh one: a restored snapshot or a
 * hydrated response (`session/snapshot`). `write` fills the new store before
 * enablement settles; `settled` runs once it has, before anything validates.
 */
export interface Seed {
  readonly write: (store: Store) => void;
  readonly settled?: (store: Store, report: (diagnostic: Diagnostic) => void) => void;
  readonly status: SessionState['status'];
  readonly completionRefused: boolean;
  readonly cycle: number;
}

const NO_PATHS: readonly ItemPath[] = [];

export function createResponseSession(definition: Definition, settings: SessionSettings, validate: Validator, seed?: Seed): Session {
  const store = createStore(definition, settings.hostIdentity);
  const diagnostics: Diagnostic[] = [...definition.diagnostics];
  const report = (finding: Diagnostic): void => {
    diagnostics.push(finding);
  };
  seed?.write(store);
  settleInitial(store, settings.retention);
  seed?.settled?.(store, report);
  const items = definition.items.map(publicItem);
  const listeners = new Set<(change: SessionChange) => void>();
  const queue: Command[] = [];
  let running = false;
  let settleRun = 0;
  let completionRefused = seed?.completionRefused ?? false;
  let status: SessionState['status'] = seed?.status ?? 'in-progress';

  const evaluate = () => {
    const { projection, visible } = project(store, status);
    const issues = validate(projection, report);
    return { projection, visible, issues, byPath: groupByPath(issues), answered: answeredSignature(visible) };
  };

  let settled = evaluate();
  let state: SessionState = {
    status,
    cycle: seed?.cycle ?? 0,
    nodes: publishNodes(settled.visible, items, settled.byPath, []),
    issues: settled.issues,
    completionRefused,
    change: null,
  };

  const surface = (paths: Iterable<ItemPath>): ItemPath[] => {
    const surfaced: ItemPath[] = [];
    for (const path of paths) {
      const node = store.byPath.get(path);
      if (node === undefined || node.surfaced) continue;
      node.surfaced = true;
      surfaced.push(path);
    }
    return surfaced;
  };

  const run = (command: Command): CommandResult => {
    const target = guard(store, state.status === 'completed', command);
    if (typeof target === 'string') return { outcome: 'refused', reason: target };

    settleRun += 1;
    const firstNew = store.sequence;
    const instances = { added: [] as ItemPath[], removed: [] as ItemPath[] };
    const settlement = settle(store, settings.retention, settleRun, apply(command, target, instances));
    recordTrace(session, settlement.recomputed.map((node) => node.path));
    const next = evaluate();

    const { completion, surfaced } = verdict(command, target, next);
    const nodes = publishNodes(next.visible, items, next.byPath, state.nodes);
    const previous = settled;
    settled = next;
    publishProjection(session, completion === 'completed' ? { ...next.projection, status } : next.projection);
    if (nodes === state.nodes && completion === null && sameIssueList(state.issues, next.issues)) return { outcome: 'unchanged' };

    const flips = flipsInDocumentOrder(store, settlement.flipped, next.visible, firstNew);
    const change: SessionChange = {
      command: command.type,
      enabled: flips.enabled,
      disabled: flips.disabled,
      surfaced: surfaced.length > 0 ? surfaced : NO_PATHS,
      added: instances.added.length > 0 ? instances.added : NO_PATHS,
      removed: instances.removed.length > 0 ? instances.removed : NO_PATHS,
      completion,
      responseChanged: !sameSignature(previous.answered, next.answered),
    };
    state = { status, cycle: state.cycle + 1, nodes, issues: next.issues, completionRefused, change };
    notify(change);
    return completion === 'refused' ? { outcome: 'refused', reason: 'validation-errors' } : { outcome: 'applied' };
  };

  /**
   * SM-03 and SM-01: leaving a node with an issue makes it live; a completion
   * with no error completes, and a refused one makes every node with an issue
   * live. Nothing ever makes a node quiet again.
   */
  const verdict = (command: Command, target: ItemNode | null, next: ReturnType<typeof evaluate>) => {
    if (command.type === 'NoteItemLeft') {
      return { completion: null, surfaced: target !== null && next.byPath.has(target.path) ? surface([target.path]) : [] };
    }
    if (command.type !== 'RequestCompletion') return { completion: null, surfaced: [] };
    if (next.issues.some((issue) => issue.severity === 'error')) {
      completionRefused = true;
      return { completion: 'refused' as const, surfaced: surface(next.byPath.keys()) };
    }
    status = 'completed';
    return { completion: 'completed' as const, surfaced: [] };
  };

  const apply = (command: Command, target: ItemNode | null, instances: { added: ItemPath[]; removed: ItemPath[] }): ItemNode[] => {
    if (target === null) return [];
    if (command.type === 'AddRepeatInstance') {
      const instance = addInstance(store, target);
      instances.added.push(instance.path);
      return subtree(instance.children);
    }
    if (command.type === 'RemoveRepeatInstance') {
      const instance = target.instances.find((candidate) => candidate.ordinal === command.ordinal);
      if (instance !== undefined) {
        instances.removed.push(instance.path);
        removeInstance(store, instance);
      }
      return [];
    }
    if (command.type === 'SetAnswer' && !sameAnswers(target.answers, command.answers)) {
      target.answers = Object.freeze(command.answers.map(copyAnswer));
      return dependentNodes(store, target);
    }
    if (command.type === 'ClearAnswer' && target.answers.length > 0) {
      target.answers = [];
      return dependentNodes(store, target);
    }
    return [];
  };

  const notify = (change: SessionChange): void => {
    for (const listener of [...listeners]) {
      try {
        listener(change);
      } catch {
        // A throwing host collaborator becomes a diagnostic, never a failed cycle.
        diagnostics.push(diagnostic('listener-threw', 'warning', null));
      }
    }
  };

  const session: Session = {
    diagnostics,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    dispatch(command) {
      if (!isCommand(command)) return { outcome: 'refused', reason: 'malformed-command' };
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
  publishProjection(session, settled.projection);
  register(session, {
    store,
    retention: settings.retention,
    status: () => state.status,
    completionRefused: () => state.completionRefused,
    cycle: () => state.cycle,
  });
  return session;
}

/** Issues by node path. Form-level issues have no node, so they are not here. */
function groupByPath(issues: readonly Issue[]): Map<ItemPath, Issue[]> {
  const byPath = new Map<ItemPath, Issue[]>();
  for (const issue of issues) {
    if (issue.path === null) continue;
    const list = byPath.get(issue.path);
    if (list === undefined) byPath.set(issue.path, [issue]);
    else list.push(issue);
  }
  return byPath;
}

/** The answered visible nodes, which is what the emitted response is built from. */
function answeredSignature(visible: readonly ItemNode[]): readonly (readonly [ItemPath, ItemNode['answers']])[] {
  return visible.filter((node) => node.answers.length > 0).map((node) => [node.path, node.answers] as const);
}

function sameSignature(a: ReturnType<typeof answeredSignature>, b: ReturnType<typeof answeredSignature>): boolean {
  return a.length === b.length && a.every(([path, answers], index) => b[index]?.[0] === path && b[index]?.[1] === answers);
}

/** Form-level issues are published nowhere else, so a change to them alone is a visible change. */
function sameIssueList(a: readonly Issue[], b: readonly Issue[]): boolean {
  return a.length === b.length && a.every((issue, index) => issue.path === b[index]?.path && issue.message === b[index]?.message);
}

function sameAnswers(a: ItemNode['answers'], b: ItemNode['answers']): boolean {
  return a.length === b.length && a.every((answer, index) => sameAnswer(answer, slot(b, index)));
}

/**
 * The nodes that flipped, as paths in document order. A node created this
 * cycle (by an added instance, or a `discard` reset) did not become enabled:
 * it appeared, which `added` reports.
 */
function flipsInDocumentOrder(
  store: Store,
  flipped: readonly ItemNode[],
  visible: readonly ItemNode[],
  firstNew: number,
): { enabled: readonly ItemPath[]; disabled: readonly ItemPath[] } {
  const live = flipped.filter((node) => !node.destroyed && node.sequence < firstNew);
  const enabled = new Set(live.filter((node) => node.effective));
  const disabled = new Set(live.filter((node) => !node.effective));
  return {
    enabled: enabled.size === 0 ? NO_PATHS : visible.filter((node) => enabled.has(node)).map((node) => node.path),
    disabled: disabled.size === 0 ? NO_PATHS : inDocumentOrder(store).filter((node) => disabled.has(node)).map((node) => node.path),
  };
}
