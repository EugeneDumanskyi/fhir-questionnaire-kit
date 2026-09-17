import type { Diagnostic } from './diagnostic.js';

/**
 * Integration error codes. Authoring problems are diagnostics, or, in `strict`
 * mode, one `definition-rejected` listing every finding (AC-01.3.1).
 *
 * @beta
 */
export type FhirqErrorCode = 'definition-rejected' | 'invalid-path' | 'invalid-options';

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
