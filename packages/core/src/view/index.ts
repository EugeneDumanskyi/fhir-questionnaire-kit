/**
 * `@fhirq/core/view` — the DOM-free presentation model (ADR-0007).
 *
 * Every BC6 behaviour that is not markup, written once: control choice, ids,
 * issue text, drafts, formatting, repeats, the error summary, announcements
 * and focus targets (M5). Still `@alpha`: M6 and M7 build the renderers on it
 * and may move a field before it is `@beta`.
 */

export { createView } from './view.js';
export type {
  Announcement,
  ChoiceView,
  ControlKind,
  ControlProps,
  ControlView,
  ErrorSummary,
  FocusTarget,
  InstanceView,
  View,
  ViewIssue,
  ViewModel,
  ViewNode,
  ViewOptions,
} from './types.js';
export type { NodeIds } from './ids.js';
