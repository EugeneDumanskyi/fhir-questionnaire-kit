import type { Issue } from '../kernel/issue.js';
import type { VisibleProjection } from '../session/projection.js';

/**
 * The slice's one rule. It reads the visible projection only, so a disabled
 * required item is never invalid (INV-V-01), and issues come out in document
 * order (INV-V-06).
 */
export function validateRequired(projection: VisibleProjection): readonly Issue[] {
  return projection.nodes
    .filter((node) => node.item.required && node.answer === undefined)
    .map((node): Issue => ({ code: 'required', severity: 'error', path: node.path }));
}
