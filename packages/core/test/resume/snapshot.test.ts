import { describe, expect, it } from 'vitest';

import { createSession, emitResponse, FhirqError, itemPath, type Answer, type ItemPath, type Questionnaire, type Session } from '../../src/index.js';
import { restoreSession, snapshot } from '../../src/resume.js';
import { bool, questionnaire, text } from '../slice.js';

const at = (path: string) => path as ItemPath;
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: at(path), answers });
const state = (session: Session) => {
  const { status, cycle, nodes, issues, completionRefused } = session.getSnapshot();
  return { status, cycle, nodes, issues, completionRefused };
};
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const code = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error instanceof FhirqError ? error.code : error;
  }
  return null;
};

const FORM: Questionnaire = {
  resourceType: 'Questionnaire',
  url: 'http://example.org/Questionnaire/form',
  version: '3',
  status: 'active',
  item: [
    { linkId: 'smoker', type: 'boolean' },
    { linkId: 'amount', type: 'string', required: true, enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
    {
      linkId: 'meds',
      type: 'group',
      repeats: true,
      item: [
        { linkId: 'name', type: 'string', required: true },
        { linkId: 'doses', type: 'group', repeats: true, item: [{ linkId: 'at', type: 'dateTime' }] },
      ],
    },
  ],
};

/** Retained answers, holes in the ordinals, nested instances, surfacing and a refused completion. */
function worked(): Session {
  const session = createSession(FORM, { hostIdentity: { subject: { reference: 'Patient/1' } } });
  set(session, 'smoker', bool(true));
  set(session, 'amount', text('RETAINED'));
  set(session, 'smoker', bool(false));
  session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
  session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
  session.dispatch({ type: 'RemoveRepeatInstance', path: itemPath('meds'), ordinal: 1 });
  set(session, 'meds[2]/name', text('aspirin'));
  session.dispatch({ type: 'AddRepeatInstance', path: at('meds[2]/doses') });
  set(session, 'meds[2]/doses[1]/at', [{ kind: 'dateTime', value: '2026-09-18T08:00:00+01:00' }]);
  session.dispatch({ type: 'NoteItemLeft', path: at('meds[0]/name') });
  session.dispatch({ type: 'RequestCompletion' });
  return session;
}

describe('snapshot and restore (US-05.3, INV-E-07)', () => {
  it('writes JSON that holds retained answers, ordinals and surfacing (AC-05.3.1)', () => {
    const saved = snapshot(worked());
    expect(roundTrip(saved)).toEqual(saved);
    expect(saved).toMatchObject({
      format: 'fhirq-snapshot/1',
      questionnaire: { url: 'http://example.org/Questionnaire/form', version: '3' },
      loadMode: 'strict',
      retention: 'retain-exclude',
      surfacing: 'blur-then-live',
      status: 'in-progress',
      completionRefused: true,
      hostIdentity: { subject: { reference: 'Patient/1' } },
      instances: { meds: { ordinals: [0, 2], next: 3 }, 'meds[0]/doses': { ordinals: [0], next: 1 }, 'meds[2]/doses': { ordinals: [0, 1], next: 2 } },
      answers: { smoker: bool(false), amount: text('RETAINED') },
      surfaced: ['meds[0]/name'],
    });
  });

  it('restores a session indistinguishable from the original, from the JSON text (AC-05.3.1)', () => {
    const original = worked();
    const restored = restoreSession(FORM, roundTrip(snapshot(original)));
    expect(state(restored)).toEqual(state(original));
    expect(snapshot(restored)).toEqual(snapshot(original));
    expect(emitResponse(restored, { authored: '2026' })).toEqual(emitResponse(original, { authored: '2026' }));
    for (const session of [original, restored]) {
      set(session, 'smoker', bool(true));
      session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    }
    expect(state(restored)).toEqual(state(original));
    expect(restored.getSnapshot().nodes.find((node) => node.path === 'amount')?.answers).toEqual(text('RETAINED'));
    expect(restored.getSnapshot().nodes.find((node) => node.path === 'meds')?.instances).toEqual([0, 2, 3]);
  });

  it('restores a completed session as completed and final', () => {
    const plain = questionnaire([{ linkId: 'smoker', type: 'boolean' }]);
    const session = createSession(plain);
    session.dispatch({ type: 'RequestCompletion' });
    const restored = restoreSession(plain, snapshot(session));
    expect(restored.getSnapshot().status).toBe('completed');
    expect(restored.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: bool(true) })).toEqual({ outcome: 'refused', reason: 'session-completed' });
  });

  it('keeps discard, the load mode and the host identity from the snapshot', () => {
    const session = createSession(FORM, { retention: 'discard', loadMode: 'lenient' });
    const restored = restoreSession(FORM, snapshot(session), { retention: 'discard' });
    expect(snapshot(restored)).toMatchObject({ retention: 'discard', loadMode: 'lenient', hostIdentity: null });
  });

  it('refuses another canonical or version with a typed error naming both (AC-05.3.3, A5)', () => {
    const saved = snapshot(createSession(FORM));
    const refused = (target: Questionnaire) => {
      try {
        restoreSession(target, saved);
      } catch (error) {
        return error;
      }
      return null;
    };
    const other = refused({ ...FORM, version: '4' });
    expect(other).toBeInstanceOf(FhirqError);
    expect(other).toMatchObject({
      code: 'snapshot-mismatch',
      findings: [{ code: 'version-drift', expected: 'http://example.org/Questionnaire/form|4', found: 'http://example.org/Questionnaire/form|3' }],
    });
    expect(refused({ ...FORM, url: 'http://example.org/other' })).toMatchObject({ code: 'snapshot-mismatch' });
    const unnamed = questionnaire(FORM.item);
    expect(refused(unnamed)).toMatchObject({ findings: [{ expected: '', found: 'http://example.org/Questionnaire/form|3' }] });
  });

  it('matches two questionnaires without a url, then refuses a path that is not there', () => {
    const plain = questionnaire([{ linkId: 'a', type: 'string' }]);
    const session = createSession(plain);
    set(session, 'a', text('x'));
    expect(restoreSession(plain, snapshot(session)).getSnapshot().nodes[0]?.answers).toEqual(text('x'));
    expect(code(() => restoreSession(questionnaire([{ linkId: 'b', type: 'string' }]), snapshot(session)))).toBe('snapshot-mismatch');
  });

  it.each([
    ['a group that does not repeat', { instances: { smoker: { ordinals: [0], next: 1 } } }],
    ['an answer the item cannot hold', { answers: { smoker: text('yes') } }],
    ['two answers on a single-answer item', { answers: { smoker: [...bool(true), ...bool(false)] } }],
    ['an unknown surfaced path', { surfaced: ['nope'] }],
    ['an unknown answer path', { answers: { nope: text('x') } }],
  ])('refuses a snapshot with %s as a mismatch', (_, change) => {
    const saved = { ...snapshot(createSession(FORM)), ...change };
    expect(code(() => restoreSession(FORM, saved))).toBe('snapshot-mismatch');
  });

  it.each([
    ['not an object', 'snapshot'],
    ['another format', { format: 'fhirq-snapshot/2' }],
    ['a bad status', { status: 'amended' }],
    ['a bad canonical', { questionnaire: { url: 1, version: null } }],
    ['surfaced not a list', { surfaced: 'meds' }],
    ['a malformed answer', { answers: { smoker: [{ kind: 'boolean', value: 'yes' }] } }],
    ['an empty answer list', { answers: { smoker: [] } }],
    ['a reused ordinal', { instances: { meds: { ordinals: [0, 0], next: 1 } } }],
    ['an ordinal past next', { instances: { meds: { ordinals: [3], next: 1 } } }],
    ['an instance entry that is not an object', { instances: { meds: 3 } }],
  ])('refuses %s as snapshot-format', (_, change) => {
    const saved = typeof change === 'string' ? change : { ...snapshot(createSession(FORM)), ...change };
    expect(() => restoreSession(FORM, saved)).toThrow(new FhirqError('snapshot-format'));
  });

  it('refuses options that change what the snapshot fixes', () => {
    const saved = snapshot(createSession(FORM));
    expect(() => restoreSession(FORM, saved, { retention: 'discard' })).toThrow(new FhirqError('invalid-options'));
    expect(() => restoreSession(FORM, saved, { loadMode: 'lenient' })).toThrow(new FhirqError('invalid-options'));
    expect(() => restoreSession(FORM, saved, { hostIdentity: {} })).toThrow(new FhirqError('invalid-options'));
    expect(() => restoreSession(FORM, saved, null as unknown as object)).toThrow(new FhirqError('invalid-options'));
    expect(() => restoreSession(FORM, saved, { loadMode: 'strict', retention: 'retain-exclude' })).not.toThrow();
  });

  it('refuses an object that is not a session', () => {
    expect(() => snapshot({} as Session)).toThrow(new FhirqError('unknown-session'));
  });
});
