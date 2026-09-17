/**
 * `@fhirq/core` — the DOM-free engine.
 *
 * **S1 spike surface (M1).** Everything exported here is `@alpha`: it exists
 * so the two renderers can be proven over a public entry point, and M2
 * replaces it with the real surface, `docs/07-api.md` and the API report
 * (`06-roadmap.md` §3, M1, decision D1).
 */

import { buildDefinition, type DefinitionInput } from './definition/definition.js';
import { createResponseSession, type Session } from './session/session.js';
import { validateRequired } from './validation/required.js';

export type { AnswerValue } from './kernel/answer.js';
export { FhirqError, type FhirqErrorCode } from './kernel/error.js';
export type { Issue, IssueCode } from './kernel/issue.js';
export { itemPath, type ItemPath } from './kernel/path.js';
export type { ConditionInput, DefinitionInput, ItemDefinition, ItemInput, ItemType } from './definition/definition.js';
export type {
  Command,
  CommandResult,
  Diagnostic,
  NodeState,
  RefusalReason,
  Session,
  SessionChange,
  SessionState,
} from './session/session.js';

/**
 * Creates a session from hand-built, version-neutral input. Synchronous: the
 * returned session has settled enablement (AC-01.1.1). Throws `FhirqError`
 * with `definition-rejected` for a defective definition.
 *
 * @alpha S1 spike: M2 replaces the input with an R4 `Questionnaire`.
 */
export function createSession(input: DefinitionInput): Session {
  return createResponseSession(buildDefinition(input), validateRequired);
}
