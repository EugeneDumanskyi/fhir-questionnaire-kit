import { createSession, emitResponse, type Diagnostic, type QuestionnaireResponse } from '@fhirq/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bool, SLICE, SMOKER } from '../../core/test/slice.js';
import { echoes } from '../src/echo.js';
import { report } from '../src/report.js';

/** A response as the hook emits it: from a session, without `authored`. */
function emitted(): QuestionnaireResponse {
  const session = createSession(SLICE, { hostIdentity: { subject: { reference: 'Patient/1' } } });
  session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
  const { authored, ...response } = emitResponse(session);
  void authored;
  return response;
}

describe('an echo of the response last emitted (ADR-0015, AC-08.1.3)', () => {
  const last = emitted();

  it.each([
    ['the same object', (response: QuestionnaireResponse) => response],
    ['a structured clone', (response: QuestionnaireResponse) => structuredClone(response)],
    ['a JSON round trip', (response: QuestionnaireResponse) => JSON.parse(JSON.stringify(response)) as QuestionnaireResponse],
    ['a copy the host stamped and completed', (response: QuestionnaireResponse) => ({ ...response, status: 'completed' as const, authored: '2026-09-24T10:00:00Z' })],
    ['a copy with an undefined property JSON would drop', (response: QuestionnaireResponse) => ({ ...response, encounter: undefined as unknown as object })],
    ['a copy with fields emission never writes', (response: QuestionnaireResponse) => ({ ...response, id: 'stored-1', meta: { versionId: '2' } })],
  ])('is %s', (_, copy) => {
    expect(echoes(copy(last), last)).toBe(true);
  });

  it.each([
    ['another answer', { item: [{ linkId: 'smoker', answer: [{ valueBoolean: false }] }] }],
    ['an answer more', { item: [{ linkId: 'smoker', answer: [{ valueBoolean: true }, { valueBoolean: false }] }] }],
    ['no items', { item: undefined }],
    ['another subject', { subject: { reference: 'Patient/2' } }],
    ['another questionnaire', { questionnaire: 'http://example.org/Questionnaire/other' }],
    ['an item where an array was', { item: { 0: { linkId: 'smoker', answer: [{ valueBoolean: true }] } } }],
  ])('is not a copy with %s', (_, change) => {
    expect(echoes({ ...last, ...change } as QuestionnaireResponse, last)).toBe(false);
  });

  it('is nothing before a response was emitted or given', () => {
    expect(echoes(last, undefined)).toBe(false);
  });
});

describe('a diagnostic the adapter raises (ADR-0015 amendment note, M6 plan D1)', () => {
  const diagnostic: Diagnostic = { code: 'controlled-value-replaced', severity: 'warning', path: null, detail: null, related: [] };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reaches the host, and the console with its code in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onDiagnostic = vi.fn();
    report(diagnostic, onDiagnostic);
    report({ ...diagnostic, code: 'control-contract', detail: 'calendar-date' }, undefined);

    expect(onDiagnostic).toHaveBeenCalledWith(diagnostic);
    expect(warn.mock.calls).toEqual([['fhirq: controlled-value-replaced'], ['fhirq: control-contract (calendar-date)']]);
  });

  it('stays off the console in production, and where there is no `process`', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onDiagnostic = vi.fn();
    vi.stubEnv('NODE_ENV', 'production');
    report(diagnostic, onDiagnostic);
    vi.unstubAllEnvs();
    vi.stubGlobal('process', undefined);
    report(diagnostic, onDiagnostic);
    vi.unstubAllGlobals();

    expect(onDiagnostic).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
