import type { Diagnostic } from './diagnostic.js';

/**
 * Integration error codes. Authoring problems are diagnostics, or, in `strict`
 * mode, one `definition-rejected` listing every finding (AC-01.3.1). A stored
 * response that is not an R4 `QuestionnaireResponse` is `response-rejected`;
 * a snapshot taken against another questionnaire is `snapshot-mismatch`, and
 * one this version cannot read is `snapshot-format` (AC-05.3.3, A5).
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
  | 'invalid-options';

/**
 * Thrown only for integration errors. The message is the code; `findings` says
 * what and where, by code and path. Neither ever holds an answer value
 * (NFR-X-04).
 *
 * @beta
 */
export class FhirqError extends Error {
  readonly code: FhirqErrorCode;
  readonly findings: readonly Diagnostic[];

  constructor(code: FhirqErrorCode, findings: readonly Diagnostic[] = []) {
    super(code);
    this.name = 'FhirqError';
    this.code = code;
    this.findings = findings;
  }
}
