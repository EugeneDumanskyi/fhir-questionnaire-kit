/**
 * `@fhirq/core`: the DOM-free engine.
 *
 * Exports are `@beta` from M2: documented in `docs/07-api.md` and held by the
 * API report in `etc/core.api.md` (M2 plan D12).
 */

import type { Answer } from './kernel/answer.js';
import type { LinkId } from './kernel/item-type.js';
import type { LoadMode } from './definition/compile.js';
import type { RetentionPolicy } from './session/enablement.js';
import type { HostIdentity, Questionnaire } from './fhir/r4/types.js';
import { open } from './open.js';
import { createResponseSession, type Session } from './session/session.js';

export type { Answer, AnswerKind, Coding, Quantity } from './kernel/answer.js';
export type { Diagnostic, DiagnosticCode, Severity } from './kernel/diagnostic.js';
export { FhirqError, type FhirqErrorCode } from './kernel/error.js';
export type { Issue, IssueCode } from './kernel/issue.js';
export type { ItemType, LinkId, Operator } from './kernel/item-type.js';
export { itemPath, type ItemPath } from './kernel/path.js';
export type { LoadMode } from './definition/compile.js';
export type { HostIdentity, Questionnaire } from './fhir/r4/types.js';
export type { RetentionPolicy } from './session/enablement.js';
export type { Command, RefusalReason } from './session/guard.js';
export type { ItemDefinition, NodeState } from './session/publish.js';
export type { CommandResult, Session, SessionChange, SessionState } from './session/session.js';

/**
 * How a session loads its questionnaire, treats hidden answers and validates.
 * `restoreSession` and `hydrateSession` in `@fhirq/core/resume` take the same
 * options.
 *
 * @beta
 */
export interface SessionOptions {
  /** `strict` (the default) rejects a questionnaire with any unsupported construct; `lenient` degrades it with diagnostics. */
  readonly loadMode?: LoadMode;
  /** `retain-exclude` (the default) keeps a hidden answer out of the response and restores it on re-enable; `discard` erases it (ADR-0011). */
  readonly retention?: RetentionPolicy;
  /** The response fields the host owns, stored verbatim for emission (INV-S-32). */
  readonly hostIdentity?: HostIdentity;
  /**
   * Cross-field rules (US-04.3), fixed for the session's life. A rule names the
   * items it reads by `linkId` and runs once per instance of the innermost
   * repeating group they share, and not at all where any item it names is
   * disabled (INV-V-03). `check` receives the visible answers, frozen, and
   * returns a message catalogue key or `null`. The issue attaches to
   * `targets`, which default to `inputs`; an empty list makes it form-level.
   * A rule that throws becomes a `rule-threw` diagnostic (INV-V-05). An unknown
   * `linkId`, or items in repeats that share no instance, is `invalid-options`.
   */
  readonly rules?: readonly {
    readonly inputs: readonly LinkId[];
    readonly targets?: readonly LinkId[];
    readonly severity?: 'error' | 'warning';
    readonly check: (answers: Readonly<Record<LinkId, readonly Answer[]>>) => string | null;
  }[];
}

/**
 * Creates a session from a FHIR R4 `Questionnaire`. Synchronous and I/O-free:
 * the returned session has settled enablement (AC-01.1.1).
 *
 * Throws `FhirqError` with `definition-rejected` and every finding when the
 * questionnaire is not loadable in the chosen mode (AC-01.1.3, AC-01.3.1), and
 * with `invalid-options` for options it cannot read.
 *
 * @beta
 */
export function createSession(questionnaire: Questionnaire, options: SessionOptions = {}): Session {
  const { definition, settings, validate } = open(questionnaire, options);
  return createResponseSession(definition, settings, validate);
}

