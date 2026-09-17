/**
 * `@fhirq/core`: the DOM-free engine.
 *
 * Exports are `@alpha` until step 13 of M2 writes `docs/07-api.md` and the API
 * report (M2 plan D12).
 */

import { compile, type LoadMode } from './definition/compile.js';
import type { RetentionPolicy } from './session/enablement.js';
import type { HostIdentity, Questionnaire } from './fhir/r4/types.js';
import { parseQuestionnaire } from './fhir/r4/parse.js';
import { FhirqError } from './kernel/error.js';
import { createResponseSession, type Session } from './session/session.js';
import { validateRequired } from './validation/required.js';

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

/** @alpha M2 fixes the surface in `docs/07-api.md`. */
export interface SessionOptions {
  /** `strict` (the default) rejects a questionnaire with any unsupported construct; `lenient` degrades it with diagnostics. */
  readonly loadMode?: LoadMode;
  /** `retain-exclude` (the default) keeps a hidden answer out of the response and restores it on re-enable; `discard` erases it (ADR-0011). */
  readonly retention?: RetentionPolicy;
  readonly hostIdentity?: HostIdentity;
}

const LOAD_MODES: readonly unknown[] = ['strict', 'lenient'];
const RETENTION: readonly unknown[] = ['retain-exclude', 'discard'];

/**
 * Creates a session from a FHIR R4 `Questionnaire`. Synchronous and I/O-free:
 * the returned session has settled enablement (AC-01.1.1).
 *
 * Throws `FhirqError` with `definition-rejected` and every finding when the
 * questionnaire is not loadable in the chosen mode (AC-01.1.3, AC-01.3.1), and
 * with `invalid-options` for options it cannot read.
 *
 * @alpha M2 fixes the surface in `docs/07-api.md`.
 */
export function createSession(questionnaire: Questionnaire, options: SessionOptions = {}): Session {
  const { loadMode = 'strict', retention = 'retain-exclude', hostIdentity } = typeof options === 'object' && options !== null ? options : invalidOptions();
  if (!LOAD_MODES.includes(loadMode) || !RETENTION.includes(retention)) invalidOptions();
  if (hostIdentity !== undefined && (typeof hostIdentity !== 'object' || hostIdentity === null)) invalidOptions();

  const parsed = parseQuestionnaire(questionnaire);
  if (!parsed.ok) throw new FhirqError('definition-rejected', parsed.findings);
  const compiled = compile(parsed.input, loadMode);
  if (!compiled.ok) throw new FhirqError('definition-rejected', compiled.findings);
  return createResponseSession(compiled.definition, { retention, hostIdentity: hostIdentity ?? null }, validateRequired);
}

function invalidOptions(): never {
  throw new FhirqError('invalid-options');
}
