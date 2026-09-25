import type { Diagnostic } from './diagnostic.js';

/**
 * Integration error codes. Authoring problems are diagnostics, or, in `strict`
 * mode, one `definition-rejected` listing every finding (AC-01.3.1). A stored
 * response that is not an R4 `QuestionnaireResponse` is `response-rejected`;
 * a snapshot taken against another questionnaire is `snapshot-mismatch`, and
 * one this version cannot read is `snapshot-format` (AC-05.3.3, A5). A
 * request the element's network file made that did not bring back JSON is
 * `request-failed` (ADR-0012 and its M7 note).
 *
 * @beta
 */
export type FhirqErrorCode =
  | 'definition-rejected'
  | 'response-rejected'
  | 'snapshot-mismatch'
  | 'snapshot-format'
  | 'unknown-session'
  | 'invalid-path'
  | 'invalid-options'
  | 'request-failed';

/**
 * Thrown only for integration errors. The message is the code; `findings` says
 * what and where, by code and path. Neither ever holds an answer value
 * (NFR-X-04). `cause`, when there is one, is what failed underneath, verbatim:
 * the platform's error, or the HTTP response that was not a success.
 *
 * @beta
 */
export class FhirqError extends Error {
  readonly code: FhirqErrorCode;
  readonly findings: readonly Diagnostic[];

  constructor(code: FhirqErrorCode, findings: readonly Diagnostic[] = [], options: { readonly cause?: unknown } = {}) {
    super(code, options);
    this.name = 'FhirqError';
    this.code = code;
    this.findings = findings;
  }
}
