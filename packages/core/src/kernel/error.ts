/** Integration error codes. Authoring findings in the slice are strict load errors. */
export type FhirqErrorCode = 'definition-rejected';

/**
 * Thrown only for integration errors. The message is the code, and `linkId`
 * names where: never an answer value (NFR-X-04).
 *
 * @alpha S1 spike surface.
 */
export class FhirqError extends Error {
  readonly code: FhirqErrorCode;
  readonly linkId: string | undefined;

  constructor(code: FhirqErrorCode, linkId?: string) {
    super(code);
    this.name = 'FhirqError';
    this.code = code;
    this.linkId = linkId;
  }
}
