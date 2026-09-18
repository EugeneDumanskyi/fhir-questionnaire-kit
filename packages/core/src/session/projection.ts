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
 * The session is composed with its validator rather than importing it:
 * `session/` may not import `validation/` (`05-architecture.md` §4.1). A host
 * rule that throws is reported, never thrown (INV-V-05).
 */
export type Validator = (projection: VisibleProjection, report: (diagnostic: Diagnostic) => void) => readonly Issue[];

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
