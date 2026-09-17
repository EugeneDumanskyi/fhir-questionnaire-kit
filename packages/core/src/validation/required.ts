import type { Issue } from '../kernel/issue.js';
import type { VisibleProjection } from '../session/projection.js';

/** Items that hold answers; `required` on a group means something else, and M3 validates it. */
const NOT_ANSWERED_ITSELF: ReadonlySet<string | null> = new Set(['group', 'display', null]);

/**
 * The slice's one rule, kept until M3 replaces it (M2 plan D9). It reads the
 * visible projection only, so a disabled required item is never invalid
 * (INV-V-01), and issues come out in document order (INV-V-06).
 */
export function validateRequired(projection: VisibleProjection): readonly Issue[] {
  return projection.nodes
    .filter((node) => node.item.required && !NOT_ANSWERED_ITSELF.has(node.item.type) && node.answers.length === 0)
    .map((node): Issue => ({ code: 'required', severity: 'error', path: node.path }));
}
