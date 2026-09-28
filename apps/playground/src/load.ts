import { createSession, FhirqError, type Diagnostic, type FhirqErrorCode, type LoadMode, type OptionResolver, type Questionnaire, type Session } from '@fhirq/core';

import { rules, scorers } from './host.js';

/** Text to load, and how: what the editor holds, and what a share link carries. */
export interface Source {
  readonly text: string;
  readonly mode: LoadMode;
}

/** What pasted text became: not JSON, a questionnaire the kit refused, or a session. */
export type Loaded =
  | { readonly kind: 'not-json'; readonly message: string }
  | { readonly kind: 'rejected'; readonly code: FhirqErrorCode; readonly findings: readonly Diagnostic[] }
  | { readonly kind: 'loaded'; readonly session: Session; readonly hostCode: boolean };

/**
 * Loads a questionnaire from text, as a host would (M9 plan D6). The demo's
 * host code comes with it when the questionnaire has the items that code
 * names; another questionnaire is loaded without it, since the kit refuses a
 * rule that names an item the questionnaire lacks (`invalid-options`). The
 * resolver comes with it either way.
 */
export function load(text: string, loadMode: LoadMode, resolver?: OptionResolver): Loaded {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { kind: 'not-json', message: error instanceof Error ? error.message : String(error) };
  }
  const questionnaire = json as Questionnaire;
  const base = resolver === undefined ? { loadMode } : { loadMode, resolver };
  try {
    return { kind: 'loaded', session: createSession(questionnaire, { ...base, scorers, rules }), hostCode: true };
  } catch (error) {
    if (!(error instanceof FhirqError)) throw error;
    if (error.code !== 'invalid-options') return { kind: 'rejected', code: error.code, findings: error.findings };
  }
  try {
    return { kind: 'loaded', session: createSession(questionnaire, base), hostCode: false };
  } catch (error) {
    if (!(error instanceof FhirqError)) throw error;
    return { kind: 'rejected', code: error.code, findings: error.findings };
  }
}
