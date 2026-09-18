/**
 * `@fhirq/core/resume`: the ways back into a session (ADR-0021). A snapshot
 * and its restore keep everything, retained answers included (AC-05.3.1);
 * hydration starts from an emitted `QuestionnaireResponse` and keeps what it
 * holds, enabled answers only (AC-06.1.1). Emission stays in `@fhirq/core`.
 *
 * A separate entry point so that a host that never resumes, and the element,
 * never carry this code: nothing reachable from `@fhirq/core` or
 * `@fhirq/core/view` imports it, which lint and the bundle-inputs check hold.
 */

import type { Questionnaire, QuestionnaireResponse, Session, SessionOptions } from './index.js';
import { decodeResponse } from './fhir/r4/decode.js';
import { FhirqError } from './kernel/error.js';
import { hydrationState } from './interchange/hydrate.js';
import { invalidOptions, open } from './open.js';
import { readSnapshot, restore, startFrom, takeSnapshot } from './session/snapshot.js';

/**
 * The session's full stored state as JSON (AC-05.3.1): every node's answers,
 * retained ones included, repeat ordinals and positions, what is surfaced, the
 * status, the retention policy and the host identity, against the canonical of
 * the questionnaire. It is engine state for the host to keep, not a clinical
 * record: it holds answers the emitted response leaves out. Throws
 * `FhirqError` with `unknown-session` for an object that is not a session.
 *
 * @beta
 */
export function snapshot(session: Session): { readonly format: 'fhirq-snapshot/1'; readonly [field: string]: unknown } {
  return takeSnapshot(session);
}

/**
 * A session exactly as `snapshot` saw it (INV-E-07): answers retained and
 * shown, ordinals and positions, surfacing and status, `completed` included.
 * The snapshot's load mode, retention and host identity are used; `options`
 * supplies the cross-field rules, which a snapshot does not hold (M3 plan
 * D5), and may repeat the load mode and retention but not change them.
 *
 * Throws `FhirqError`: `snapshot-format` for anything that is not a snapshot
 * of this format; `snapshot-mismatch` when it was taken against a questionnaire
 * with another canonical or version, with a finding naming both, since a
 * snapshot is not a migration format (AC-05.3.3); `invalid-options` for a load
 * mode, retention or host identity that differs from the snapshot's; and
 * `definition-rejected` as `createSession` does.
 *
 * @beta
 */
export function restoreSession(questionnaire: Questionnaire, snapshot: unknown, options: SessionOptions = {}): Session {
  const saved = readSnapshot(snapshot);
  const given = typeof options === 'object' && options !== null ? options : invalidOptions();
  if (
    (given.loadMode !== undefined && given.loadMode !== saved.loadMode) ||
    (given.retention !== undefined && given.retention !== saved.retention) ||
    given.hostIdentity !== undefined
  ) {
    invalidOptions();
  }
  const { definition, settings, validate } = open(questionnaire, { ...given, loadMode: saved.loadMode, retention: saved.retention });
  return restore(definition, { ...settings, hostIdentity: saved.hostIdentity }, validate, saved);
}

/**
 * A session resumed from a stored `QuestionnaireResponse` and its questionnaire
 * (US-06.1, `04-domain.md` §8). Every answer that fits is loaded, repeat
 * instances are rebuilt at their stored counts, enablement settles against
 * them, and the session is `in-progress` whatever the stored status. What does
 * not fit is a diagnostic in `session.diagnostics`, never loaded and never
 * emitted: `version-drift`, `orphan-answer`, `quarantined-answer`, and
 * `hydrated-answer-disabled` for an answer that lands on a disabled item. Each
 * names paths and types, never a value. The host identity is `options`', or
 * else the response's `subject`, `author`, `encounter` and `identifier`.
 *
 * Throws `FhirqError`: `definition-rejected` and `invalid-options` as
 * `createSession` does, and `response-rejected` with findings for anything that
 * is not an R4 `QuestionnaireResponse`. Never for its content (INV-E-08).
 *
 * @beta
 */
export function hydrateSession(questionnaire: Questionnaire, response: QuestionnaireResponse, options: SessionOptions = {}): Session {
  const { definition, settings, validate } = open(questionnaire, options);
  const decoded = decodeResponse(response);
  if (!decoded.ok) throw new FhirqError('response-rejected', decoded.findings);
  const hostIdentity = settings.hostIdentity ?? decoded.response.identity;
  return startFrom(definition, { ...settings, hostIdentity }, validate, hydrationState(definition, decoded.response));
}
