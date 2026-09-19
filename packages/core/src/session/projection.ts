import type { Answer } from '../kernel/answer.js';
import type { Diagnostic } from '../kernel/diagnostic.js';
import type { Issue } from '../kernel/issue.js';
import type { ItemPath } from '../kernel/path.js';
import type { Definition, ItemDef } from '../definition/compile.js';

/**
 * The visible projection (`04-domain.md` §1, §9.3 property 2): effectively
 * enabled nodes only, in document order, with repeat instances in position
 * order. Validation, cross-field rules and emission read answers through this
 * and nothing else (`05-architecture.md` §4.1), so none of them can see a
 * retained answer. A disabled node's subtree is absent whole (INV-S-01).
 */
export interface VisibleNode {
  readonly path: ItemPath;
  readonly item: ItemDef;
  readonly answers: readonly Answer[];
  /** A group's visible children in document order; empty for a repeating group, whose children sit in `instances`. */
  readonly children: readonly VisibleNode[];
  /** A repeating group's live instances in position order (INV-S-21); empty for any other node. */
  readonly instances: readonly VisibleInstance[];
}

export interface VisibleInstance {
  readonly ordinal: number;
  readonly path: ItemPath;
  readonly children: readonly VisibleNode[];
}

export interface VisibleProjection {
  /** The canonical the questionnaire declares, for emission (INV-E-05, M3 plan D6). */
  readonly definition: Pick<Definition, 'url' | 'version'>;
  readonly status: 'in-progress' | 'completed';
  /** Stored verbatim; never read or invented (INV-S-32). */
  readonly hostIdentity: object | null;
  readonly roots: readonly VisibleNode[];
  /** Every visible node in document order: pre-order, instances in position order. */
  readonly nodes: readonly VisibleNode[];
}

/**
 * Calls host code through the session's collaborator guard (`session/collaborator`):
 * the value it returned, or `null` when it threw, which `finding` reports
 * (INV-X-09). Commands are refused while it runs.
 */
export type Collaborate = <T>(finding: Diagnostic, call: () => T) => { readonly value: T } | null;

/** What cycle step 5 produces: the validation result and each scorer's result. */
export interface Checked {
  readonly issues: readonly Issue[];
  /** By scorer name: the value it returned, or `null` once it threw. The same object while no score changed. */
  readonly scores: Readonly<Record<string, unknown>>;
}

/**
 * The session is composed with its validator rather than importing it:
 * `session/` may not import `validation/` (`05-architecture.md` §4.1). Host
 * rules and scorers run through `call`, so a throw is reported, never thrown
 * (INV-V-05, ADR-0006).
 */
export type Validator = (projection: VisibleProjection, call: Collaborate) => Checked;

/**
 * What a collaborator is given (INV-X-04, `ports/`): the status and the
 * visible nodes, deeply frozen, so host code cannot change what the session,
 * emission or the next collaborator reads (AC-04.3.2). Built only for
 * sessions that have a scorer or an evaluator.
 */
export function shared(projection: VisibleProjection): Pick<VisibleProjection, 'status' | 'nodes'> {
  return frozen({ status: projection.status, nodes: projection.nodes });
}

function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) frozen((value as Readonly<Record<string, unknown>>)[key]);
  }
  return value;
}

/**
 * Each session's projection as of its latest cycle, keyed by the public
 * `Session` object: the one door emission has into a session (AC-05.3.2).
 */
const projections = new WeakMap<object, VisibleProjection>();

export function publishProjection(session: object, projection: VisibleProjection): void {
  projections.set(session, projection);
}

export function projectionOf(session: object): VisibleProjection | undefined {
  return projections.get(session);
}
