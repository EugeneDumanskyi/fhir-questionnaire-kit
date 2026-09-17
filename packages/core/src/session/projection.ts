import type { Answer } from '../kernel/answer.js';
import type { Issue } from '../kernel/issue.js';
import type { ItemPath } from '../kernel/path.js';
import type { ItemDef } from '../definition/compile.js';

/**
 * The visible projection (`04-domain.md` §1): effectively enabled nodes only,
 * in document order. Validation reads answers through this and nothing else
 * (`05-architecture.md` §4.1), so it cannot see a retained answer.
 */
export interface VisibleNode {
  readonly path: ItemPath;
  readonly item: ItemDef;
  readonly answers: readonly Answer[];
}

export interface VisibleProjection {
  readonly nodes: readonly VisibleNode[];
}

/**
 * The session is composed with its validator rather than importing it:
 * `session/` may not import `validation/` (`05-architecture.md` §4.1).
 */
export type Validator = (projection: VisibleProjection) => readonly Issue[];
