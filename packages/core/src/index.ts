/**
 * `@fhirq/core`: the DOM-free engine.
 *
 * Exports are `@beta` from M2: documented in `docs/07-api.md` and held by the
 * API report in `etc/core.api.md` (M2 plan D12).
 */

import type { Answer } from './kernel/answer.js';
import type { Diagnostic } from './kernel/diagnostic.js';
import type { LinkId } from './kernel/item-type.js';
import type { ExpressionEvaluator, OptionResolver, VisibleProjection } from './ports/index.js';
import type { LoadMode } from './definition/compile.js';
import type { RetentionPolicy } from './session/enablement.js';
import type { HostIdentity, Questionnaire, QuestionnaireResponse } from './fhir/r4/types.js';
import { emit } from './interchange/emit.js';
import { open } from './open.js';
import { createResponseSession, type Session } from './session/session.js';

export type { Answer, AnswerKind, Coding, Quantity } from './kernel/answer.js';
export type { Diagnostic, DiagnosticCode, Severity } from './kernel/diagnostic.js';
export { FhirqError, type FhirqErrorCode } from './kernel/error.js';
export type { Issue, IssueCode } from './kernel/issue.js';
export type { ItemType, LinkId, Operator } from './kernel/item-type.js';
export { itemPath, type ItemPath } from './kernel/path.js';
export type { LoadMode } from './definition/compile.js';
export type { HostIdentity, Questionnaire, QuestionnaireResponse } from './fhir/r4/types.js';
export type { ExpressionEvaluator, OptionResolver, VisibleProjection } from './ports/index.js';
export type { RetentionPolicy } from './session/enablement.js';
export type { Command, RefusalReason } from './session/guard.js';
export type { ItemDefinition, NodeState } from './session/publish.js';
export type { CommandResult, Session, SessionChange, SessionState } from './session/session.js';

/**
 * How a session loads its questionnaire, treats hidden answers and validates,
 * and the host code it calls (BC5). `restoreSession` and `hydrateSession` in
 * `@fhirq/core/resume` take the same options. Every collaborator is fixed for
 * the session's life, and none is in a snapshot, so a restore needs the same
 * ones.
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
  /**
   * Scoring functions by name (US-07.2). `score` receives the visible
   * projection, frozen, and re-runs when a node of an item named in `inputs`
   * appears, disappears or changes its answers. Its result is
   * `SessionState.scores[name]`, never interpreted (INV-X-05); a scorer that
   * throws has its result cleared to `null` and becomes one `scorer-threw`
   * diagnostic naming it (ADR-0006).
   */
  readonly scorers?: Readonly<
    Record<string, { readonly inputs: readonly LinkId[]; readonly score: (projection: VisibleProjection) => unknown }>
  >;
  /**
   * Resolves the value sets the questionnaire references (ADR-0012). Without
   * one, each item bound to a value set takes no coded answer and reports
   * `unresolved-options` (INV-D-08).
   */
  readonly resolver?: OptionResolver;
  /**
   * Computes `calculatedExpression` items (ADR-0017). Without one, each such
   * item has no value and reports `no-evaluator` (INV-D-09).
   */
  readonly evaluator?: ExpressionEvaluator;
  /**
   * Sanitizes an item's `rendering-xhtml` once, as the session opens; the
   * result is `ItemDefinition.xhtml`. Without one, rich text is never kept and
   * each item that has it reports `no-sanitizer` (INV-X-06).
   */
  readonly sanitize?: (xhtml: string) => string;
  /**
   * Receives what a rule, scorer, evaluator, sanitizer or resolver threw or
   * rejected with, verbatim and in memory, with the diagnostic it became
   * (AC-07.1.2, AC-07.2.4). The session never logs it and never puts it in
   * state. A handler that throws becomes `listener-threw`.
   */
  readonly onCollaboratorError?: (error: unknown, diagnostic: Diagnostic) => void;
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

/**
 * The session's current `QuestionnaireResponse` (AC-05.1.1): FHIR R4 JSON with
 * the questionnaire's canonical (none when it declares no `url`), the session's
 * status (INV-E-05), the host's identity verbatim and nothing invented
 * (AC-05.1.2), `authored`, and a nested item tree of the enabled, answered
 * items only (INV-E-01), repeat instances in position order (INV-E-03).
 *
 * `authored` is the caller's FHIR `dateTime`, or else the current instant in
 * UTC. Pure otherwise: the items are built once per cycle and shared, frozen.
 * Throws `FhirqError` with `unknown-session` for an object that is not a
 * session, and `invalid-options` for an `authored` that is not a `dateTime`.
 *
 * @beta
 */
export function emitResponse(session: Session, options: { readonly authored?: string } = {}): QuestionnaireResponse {
  return emit(session, options);
}
