import type { Diagnostic } from '@fhirq/core';

/** Set by a bundler or by Node; absent in a browser that loads the module as it is. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * Hands a diagnostic the adapter raised itself to the host (ADR-0015
 * amendment note, M6 plan D1), and in development also writes its code and
 * detail to the console. Neither ever holds an answer (NFR-X-04). Called from
 * effects only, never while rendering.
 */
export function report(diagnostic: Diagnostic, onDiagnostic: ((diagnostic: Diagnostic) => void) | undefined): void {
  onDiagnostic?.(diagnostic);
  try {
    // Written out whole, so a bundler's define turns it into a constant and a production build drops the call.
    if (process.env.NODE_ENV !== 'production') console.warn(`fhirq: ${diagnostic.code}${diagnostic.detail === null ? '' : ` (${diagnostic.detail})`}`);
  } catch {
    // No bundler and no Node: `process` is not defined, and there is no development build to warn in.
  }
}
