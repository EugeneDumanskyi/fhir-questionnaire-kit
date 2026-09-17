/**
 * `@fhirq/core/view` — the DOM-free presentation model (ADR-0007).
 *
 * **S1 spike surface (M1).** Exported `@alpha`; M5 completes it and M2 onward
 * documents the real surface (decision D1).
 */

export {
  createView,
  type Announcement,
  type ControlKind,
  type ErrorSummary,
  type ErrorSummaryEntry,
  type FocusTarget,
  type ShortTextViewNode,
  type View,
  type ViewIssue,
  type ViewModel,
  type ViewNode,
  type ViewOptions,
  type YesNoChoice,
  type YesNoViewNode,
} from './view.js';
export type { NodeIds } from './ids.js';
