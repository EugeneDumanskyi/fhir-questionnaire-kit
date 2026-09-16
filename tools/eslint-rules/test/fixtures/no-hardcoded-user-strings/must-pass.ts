// MUST PASS: codes, paths and keys — the shapes that are not prose.

export type MessageKey = 'validation.required' | 'validation.outOfRange';

export interface Diagnostic {
  readonly code: MessageKey;
  readonly path: string;
}

const SYSTEM = 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl';

export function required(path: string): Diagnostic {
  return { code: 'validation.required', path };
}

export function isItemControl(url: string): boolean {
  return url === SYSTEM;
}
