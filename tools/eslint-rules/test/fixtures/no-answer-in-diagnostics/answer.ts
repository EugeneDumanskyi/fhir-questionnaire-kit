// The shapes the fixtures need, as core declares them (kernel/answer, kernel/diagnostic, kernel/error).
export interface Coding {
  readonly system?: string;
  readonly code?: string;
}
export type Answer =
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'integer'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'coding'; readonly value: Coding };

export interface Diagnostic {
  readonly code: string;
  readonly detail: string | null;
}
export declare function diagnostic(code: string, severity: 'warning', path: string | null, extra?: { readonly detail?: string; readonly found?: string }): Diagnostic;
export declare class FhirqError extends Error {
  constructor(code: string, findings?: readonly Diagnostic[]);
}
