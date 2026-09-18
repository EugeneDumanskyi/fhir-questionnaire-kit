import { copyAnswer, isAnswer, type Answer } from '../kernel/answer.js';
import { diagnostic, type Diagnostic } from '../kernel/diagnostic.js';
import { FhirqError } from '../kernel/error.js';
import type { ItemPath } from '../kernel/path.js';
import type { Definition } from '../definition/compile.js';
import type { Validator } from './projection.js';
import { storedState } from './registry.js';
import { createResponseSession, type Session, type SessionSettings } from './session.js';
import { addInstance, inDocumentOrder, isRepeatingGroup, removeInstance, type Store } from './store.js';

/**
 * The snapshot (BC4, ADR-0010, AC-05.3.1): the session's stored state in full,
 * as JSON — every node's answers including retained ones, repeat ordinals and
 * positions, surfacing, lifecycle status — and the stored-state writer that
 * restore and hydration start a session from. Reachable only from the resume
 * entry point (ADR-0021); it reads stored state through the registry, the
 * second door that §4.1 names, and is the only reader of retained answers.
 *
 * A snapshot is engine state, not a clinical record and not a migration
 * format: it names the canonical it was taken against, and restoring it
 * against another is refused (AC-05.3.3). Its format is versioned, and a
 * format change is a major change of core (A5). Option lists and cross-field
 * rules are not in it: restore needs the same rules (M3 plan D5).
 */

export const SNAPSHOT_FORMAT = 'fhirq-snapshot/1';

/** A type, not an interface, so it has the implicit index signature `snapshot`'s public return type needs. */
export type SnapshotJson = {
  readonly format: typeof SNAPSHOT_FORMAT;
  readonly questionnaire: { readonly url: string | null; readonly version: string | null };
  readonly loadMode: Definition['loadMode'];
  readonly retention: SessionSettings['retention'];
  /** SM-03's mode. M3 has one (plan D4); the snapshot records it so another can be added without a format change. */
  readonly surfacing: 'blur-then-live';
  readonly status: 'in-progress' | 'completed';
  readonly cycle: number;
  readonly completionRefused: boolean;
  readonly hostIdentity: object | null;
  /** Every repeating group node, enabled or not, in document order: live ordinals in position order, and the next ordinal. */
  readonly instances: Readonly<Record<string, { readonly ordinals: readonly number[]; readonly next: number }>>;
  /** Every node with answers, retained ones included, in document order. */
  readonly answers: Readonly<Record<string, readonly Answer[]>>;
  /** Nodes whose issues are live (SM-03). */
  readonly surfaced: readonly string[];
};

export function takeSnapshot(session: object): SnapshotJson {
  const stored = storedState(session);
  if (stored === undefined) throw new FhirqError('unknown-session');
  const { store } = stored;
  const instances: Record<string, SnapshotJson['instances'][string]> = {};
  const answers: Record<string, readonly Answer[]> = {};
  const surfaced: string[] = [];
  for (const node of inDocumentOrder(store)) {
    if (isRepeatingGroup(node.def)) instances[node.path] = { ordinals: node.instances.map((instance) => instance.ordinal), next: node.nextOrdinal };
    if (node.answers.length > 0) answers[node.path] = node.answers;
    if (node.surfaced) surfaced.push(node.path);
  }
  const { url, version, loadMode } = store.definition;
  return {
    format: SNAPSHOT_FORMAT,
    questionnaire: { url, version },
    loadMode,
    retention: stored.retention,
    surfacing: 'blur-then-live',
    status: stored.status(),
    cycle: stored.cycle(),
    completionRefused: stored.completionRefused(),
    hostIdentity: store.hostIdentity,
    instances,
    answers,
    surfaced,
  };
}

/**
 * The header of an untrusted snapshot: what `restoreSession` needs before it
 * loads the questionnaire. Throws `snapshot-format` for anything that is not a
 * snapshot of this format.
 */
export function readSnapshot(candidate: unknown): SnapshotJson {
  if (!isRecord(candidate) || !Object.entries(FIELDS).every(([field, valid]) => valid(candidate[field]))) {
    throw new FhirqError('snapshot-format');
  }
  return candidate as SnapshotJson;
}

const oneOf =
  (...values: readonly unknown[]) =>
  (value: unknown): boolean =>
    values.includes(value);

/** What each top-level field of a snapshot must be; the per-path entries are read as they are restored. */
const FIELDS: Readonly<Record<keyof SnapshotJson, (value: unknown) => boolean>> = {
  format: oneOf(SNAPSHOT_FORMAT),
  questionnaire: (value) => isRecord(value) && optionalText(value['url']) && optionalText(value['version']),
  loadMode: oneOf('strict', 'lenient'),
  retention: oneOf('retain-exclude', 'discard'),
  surfacing: oneOf('blur-then-live'),
  status: oneOf('in-progress', 'completed'),
  cycle: (value) => Number.isSafeInteger(value),
  completionRefused: (value) => typeof value === 'boolean',
  hostIdentity: (value) => typeof value === 'object',
  instances: isRecord,
  answers: isRecord,
  surfaced: (value) => Array.isArray(value) && value.every((path) => typeof path === 'string'),
};

/** Restores a snapshot read by `readSnapshot` against a definition loaded with its `loadMode`. */
export function restore(definition: Definition, settings: SessionSettings, validate: Validator, snapshot: SnapshotJson): Session {
  const expected = canonical(definition.url, definition.version);
  const found = canonical(snapshot.questionnaire.url, snapshot.questionnaire.version);
  if (expected !== found) {
    throw new FhirqError('snapshot-mismatch', [diagnostic('version-drift', 'error', null, { expected, found })]);
  }
  const instances = new Map(Object.entries(snapshot.instances).map(([path, entry]) => [path as ItemPath, readInstances(entry)]));
  const answers = new Map(Object.entries(snapshot.answers).map(([path, list]) => [path as ItemPath, readAnswers(list)]));
  return startFrom(definition, settings, validate, {
    instances,
    answers,
    surfaced: snapshot.surfaced as readonly ItemPath[],
    status: snapshot.status,
    completionRefused: snapshot.completionRefused,
    cycle: snapshot.cycle,
    diagnostics: [],
    dropDisabled: false,
  });
}

/** A canonical as a response writes it, `url|version`; `''` when the questionnaire declares no `url`. */
export function canonical(url: string | null, version: string | null): string {
  if (url === null) return '';
  return version === null ? url : `${url}|${version}`;
}

/**
 * Stored state to start a session from, keyed by node path. Paths are written
 * in document order of their depth, so a group's instances exist before
 * anything inside them is written.
 */
export interface StoredState {
  readonly instances: ReadonlyMap<ItemPath, { readonly ordinals: readonly number[]; readonly next: number }>;
  readonly answers: ReadonlyMap<ItemPath, readonly Answer[]>;
  readonly surfaced: readonly ItemPath[];
  readonly status: 'in-progress' | 'completed';
  readonly completionRefused: boolean;
  readonly cycle: number;
  /** Findings made while reading the state, reported after the load's own. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Hydration step 5 (`04-domain.md` §8, T7): once enablement settles, answers
   * on disabled nodes are dropped, each with `hydrated-answer-disabled`, so no
   * hydrated node is retained. Restore keeps them: a snapshot is exact.
   */
  readonly dropDisabled: boolean;
}

/**
 * The stored-state writer. A path the definition does not have, or an answer
 * its item cannot hold, means the state was not taken against this
 * questionnaire: `snapshot-mismatch`. Hydration builds its state from the
 * definition, so only a snapshot can reach that.
 */
export function startFrom(definition: Definition, settings: SessionSettings, validate: Validator, state: StoredState): Session {
  const mismatch = (path: string): never => {
    throw new FhirqError('snapshot-mismatch', [diagnostic('orphan-answer', 'error', path)]);
  };
  const write = (store: Store): void => {
    for (const [path, { ordinals, next }] of [...state.instances].sort(([a], [b]) => a.length - b.length)) {
      const group = store.byPath.get(path);
      if (group === undefined || !isRepeatingGroup(group.def)) return mismatch(path);
      for (const instance of [...group.instances]) removeInstance(store, instance);
      for (const ordinal of ordinals) {
        group.nextOrdinal = ordinal;
        addInstance(store, group);
      }
      group.nextOrdinal = next;
    }
    for (const [path, answers] of state.answers) {
      const node = store.byPath.get(path);
      const fits = node !== undefined && !node.def.calculated && (answers.length === 1 || node.def.repeats);
      if (!fits || !answers.every((answer) => node.def.accepts.includes(answer.kind))) return mismatch(path);
      node.answers = Object.freeze(answers.map(copyAnswer));
    }
    for (const path of state.surfaced) {
      const node = store.byPath.get(path);
      if (node === undefined) return mismatch(path);
      node.surfaced = true;
    }
  };
  const settled = (store: Store, report: (finding: Diagnostic) => void): void => {
    state.diagnostics.forEach(report);
    if (!state.dropDisabled) return;
    for (const node of inDocumentOrder(store)) {
      if (node.effective || node.answers.length === 0) continue;
      node.answers = [];
      report(diagnostic('hydrated-answer-disabled', 'warning', node.path));
    }
  };
  return createResponseSession(definition, settings, validate, {
    write,
    settled,
    status: state.status,
    completionRefused: state.completionRefused,
    cycle: state.cycle,
  });
}

function readInstances(entry: unknown): { ordinals: readonly number[]; next: number } {
  const { ordinals, next } = (isRecord(entry) ? entry : {}) as { ordinals?: unknown; next?: unknown };
  const valid =
    Array.isArray(ordinals) &&
    typeof next === 'number' &&
    Number.isSafeInteger(next) &&
    ordinals.every((ordinal: unknown) => typeof ordinal === 'number' && Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < next) &&
    new Set(ordinals).size === ordinals.length;
  if (!valid) throw new FhirqError('snapshot-format');
  return { ordinals: ordinals as readonly number[], next };
}

function readAnswers(list: unknown): readonly Answer[] {
  if (!Array.isArray(list) || list.length === 0 || !list.every(isAnswer)) throw new FhirqError('snapshot-format');
  return list;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
