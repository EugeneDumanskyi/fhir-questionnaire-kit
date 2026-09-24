import type { QuestionnaireResponse } from '@fhirq/core';

/** What an emitted response holds besides `status` and `authored`: its content and the host's identity (INV-E-06). */
const FIELDS = ['questionnaire', 'identifier', 'subject', 'encounter', 'author', 'item'] as const;

/**
 * Whether `value` echoes the response last emitted (ADR-0015, AC-08.1.3): the
 * same object, or one equal to it in every field emission writes, ignoring
 * `status` and `authored`. A copy that went through JSON matches too: an
 * absent property and an `undefined` one are the same.
 */
export const echoes = (value: QuestionnaireResponse, last: QuestionnaireResponse | undefined): boolean =>
  value === last || (last !== undefined && FIELDS.every((field) => equal(value[field], last[field])));

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Readonly<Record<string, unknown>>;
  const y = b as Readonly<Record<string, unknown>>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((key) => equal(x[key], y[key]));
}
