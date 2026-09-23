import type { SessionState } from '../index.js';
import type { Catalogue } from './catalogue.js';
import { fill, formatDateTime, formatNumber } from './format.js';
import type { ErrorSummary, ViewNode } from './types.js';

type Entry = ErrorSummary['entries'][number];

/**
 * The error summary (AC-11.3.1): after a refused completion, every surfaced
 * issue, in `SessionState.issues` order: form-level first, with no link, since
 * no item holds them; then document order and repeat position (INV-V-06), the
 * view's own issue after the engine's at its node. An entry links to the
 * node's control. A repeating group's links to its add control while it can
 * add, else to its label, as a plain group's does (M5 plan D12). The same
 * object is kept while nothing in it changed.
 */
export function summarise(
  state: SessionState,
  nodes: readonly ViewNode[],
  prefix: string,
  messages: Catalogue,
  locale: string,
  timeZone: string | undefined,
  previous: ErrorSummary | null,
): ErrorSummary | null {
  if (!state.completionRefused || state.status === 'completed') return null;
  const entries: Entry[] = state.issues
    .filter((issue) => issue.path === null)
    .map((issue) => {
      const { limit } = issue.params;
      const values = limit === undefined ? {} : { limit: typeof limit === 'number' ? formatNumber(limit, locale) : formatDateTime(limit, locale, timeZone) };
      return { path: null, message: messages.issue(issue, values), focusId: null };
    });
  const visit = (list: readonly ViewNode[]): void => {
    for (const node of list) {
      const { ids } = node;
      const focusId =
        node.control === 'group' || (node.control === 'repeating-group' && !node.canAdd) ? ids.label : ids.control;
      for (const issue of node.issues) entries.push({ path: node.path, message: fill(messages.errorSummaryEntry, { message: issue.message, label: node.label }), focusId });
      if (node.control === 'group') visit(node.children);
      if (node.control === 'repeating-group') for (const instance of node.instances) visit(instance.children);
    }
  };
  visit(nodes);
  if (entries.length === 0) return null;
  // Entries are strings and nulls only, so their JSON is their equality.
  if (previous !== null && JSON.stringify(previous.entries) === JSON.stringify(entries)) return previous;
  const id = `${prefix}-summary`;
  return { id, headingId: `${id}-heading`, heading: messages.errorSummaryHeading, entries };
}
