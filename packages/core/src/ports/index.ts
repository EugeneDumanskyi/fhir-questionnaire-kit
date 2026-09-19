import type { Answer } from '../kernel/answer.js';
import type { ItemType, LinkId } from '../kernel/item-type.js';
import type { ItemPath } from '../kernel/path.js';

/**
 * BC5's ports (`04-domain.md` §3.5): what the host plugs in. Types only, and
 * they import `kernel` alone (`05-architecture.md` §4.1), so no port can reach
 * session state. Three are named exports (M4 plan D1); the rest — scorers, the
 * sanitizer, the error handler — are inline shapes on `SessionOptions`.
 */

declare global {
  /**
   * The WHATWG `AbortSignal` of the host's runtime, which core types without
   * the DOM library. Only the member core relies on is declared here; the
   * host's own declaration supplies the rest, so the signal can be handed
   * straight to `fetch` (ADR-0012, M4 ruling on `AbortController`).
   */
  interface AbortSignal {
    readonly aborted: boolean;
  }
}

/**
 * What every collaborator reads: the enabled nodes in document order, repeat
 * instances in position order, with their answers (INV-X-04). A disabled
 * node and its retained answers are absent. Deeply frozen.
 *
 * @beta
 */
export interface VisibleProjection {
  /** The session's status in the cycle being run. */
  readonly status: 'in-progress' | 'completed';
  /** Each enabled node, with its item's `linkId` and type and its answers. */
  readonly nodes: readonly {
    readonly path: ItemPath;
    readonly item: { readonly linkId: LinkId; readonly type: ItemType | null };
    readonly answers: readonly Answer[];
  }[];
}

/**
 * Resolves a value set to its coded options (ADR-0012). Called once per
 * distinct canonical per session, at session start, and again only on a
 * `RetryOptions` after a failure (ADR-0005, INV-X-01). `signal` aborts when
 * the session is disposed. A rejection reaches the host verbatim through
 * `onCollaboratorError`; the session never retries or logs on its own
 * (INV-X-03).
 *
 * @beta
 */
export type OptionResolver = (
  valueSet: string,
  context: { readonly signal: AbortSignal },
) => PromiseLike<readonly { readonly system?: string; readonly code: string; readonly display?: string }[]>;

/**
 * Evaluates a `calculatedExpression` (ADR-0017). Synchronous and pure: it runs
 * inside the cycle, in document order, and returns the item's value, or
 * `undefined` for none. It must return the same value for the same projection.
 *
 * @beta
 */
export interface ExpressionEvaluator {
  /** The value of `expression` for the calculated node at `context.path`, read from `context.projection`. */
  evaluate(
    expression: { readonly language: string; readonly expression: string; readonly name?: string },
    context: { readonly path: ItemPath; readonly projection: VisibleProjection },
  ): Answer | undefined;
}
