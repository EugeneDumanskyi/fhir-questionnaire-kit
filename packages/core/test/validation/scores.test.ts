import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSession, FhirqError, itemPath, type Answer, type Questionnaire, type Session, type SessionOptions, type VisibleProjection } from '../../src/index.js';
import { restoreSession, snapshot } from '../../src/resume.js';
import { bool, questionnaire } from '../slice.js';

type Scorers = NonNullable<SessionOptions['scorers']>;

/** A two-item total, with the second item hidden unless the first says so (AC-07.2.2). */
const FORM: Questionnaire = questionnaire([
  { linkId: 'interest', type: 'integer' },
  { linkId: 'asked', type: 'boolean' },
  { linkId: 'mood', type: 'integer', enableWhen: [{ question: 'asked', operator: '=', answerBoolean: true }] },
  { linkId: 'note', type: 'string' },
]);

const integer = (value: number): readonly Answer[] => [{ kind: 'integer', value }];
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: itemPath(path), answers });
const total = (projection: VisibleProjection): number =>
  projection.nodes.reduce((sum, node) => sum + (node.answers[0]?.kind === 'integer' ? node.answers[0].value : 0), 0);
const scorers: Scorers = { total: { inputs: ['interest', 'mood'], score: total } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scoring functions (US-07.2, ADR-0006, M4 plan D5)', () => {
  it('exposes each result by name, recomputed as a contributing answer changes (AC-07.2.1)', () => {
    const session = createSession(FORM, { scorers });
    expect(session.getSnapshot().scores).toEqual({ total: 0 });
    set(session, 'interest', integer(2));
    expect(session.getSnapshot().scores).toEqual({ total: 2 });
  });

  it('never sees a hidden item, retained answer included (AC-07.2.2, INV-X-04)', () => {
    const session = createSession(FORM, { scorers });
    set(session, 'asked', bool(true));
    set(session, 'interest', integer(1));
    set(session, 'mood', integer(3));
    expect(session.getSnapshot().scores).toEqual({ total: 4 });
    set(session, 'asked', bool(false));
    expect(session.getSnapshot().scores).toEqual({ total: 1 });
    set(session, 'asked', bool(true));
    expect(session.getSnapshot().scores).toEqual({ total: 4 });
  });

  it('re-runs a scorer only when what its inputs show changed, and keeps the record while nothing did (ADR-0009)', () => {
    const score = vi.fn(total);
    const session = createSession(FORM, { scorers: { total: { inputs: ['interest'], score } } });
    const first = session.getSnapshot().scores;
    set(session, 'note', [{ kind: 'string', value: 'x' }]);
    set(session, 'asked', bool(true));
    expect(score).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().scores).toBe(first);
    set(session, 'interest', integer(1));
    expect(score).toHaveBeenCalledTimes(2);
  });

  it('is a visible change on its own: a new score alone publishes a cycle', () => {
    let offset = 0;
    const session = createSession(FORM, { scorers: { total: { inputs: ['interest'], score: (p) => total(p) + offset } } });
    const listener = vi.fn();
    session.subscribe(listener);
    set(session, 'interest', integer(1));
    expect(listener).toHaveBeenCalledTimes(1);
    offset = 10;
    expect(set(session, 'interest', integer(1))).toEqual({ outcome: 'unchanged' });
    expect(set(session, 'interest', integer(2))).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot().scores).toEqual({ total: 12 });
  });

  it('clears a throwing scorer, keeps the others and the form, and reports it once without the thrown text (AC-07.2.4, ADR-0006)', () => {
    const console_ = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')];
    const onCollaboratorError = vi.fn();
    const thrown = new Error('mood was SENTINEL-7');
    const session = createSession(FORM, {
      onCollaboratorError,
      scorers: {
        ...scorers,
        strict: {
          inputs: ['interest', 'mood'],
          score: (projection) => {
            // A scorer written for a flat instrument: throws when an item is hidden (ADR-0006's case).
            if (!projection.nodes.some((node) => node.item.linkId === 'mood')) throw thrown;
            return total(projection) * 2;
          },
        },
      },
    });
    set(session, 'asked', bool(true));
    set(session, 'mood', integer(3));
    expect(session.getSnapshot().scores).toEqual({ total: 3, strict: 6 });
    expect(set(session, 'asked', bool(false))).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot().scores).toEqual({ total: 0, strict: null });
    set(session, 'interest', integer(1));
    expect(session.getSnapshot().scores).toEqual({ total: 1, strict: null });
    const finding = { code: 'scorer-threw', severity: 'warning', path: null, related: [], detail: 'strict' };
    expect(session.diagnostics).toEqual([finding]);
    expect(onCollaboratorError).toHaveBeenCalledTimes(3);
    expect(onCollaboratorError).toHaveBeenCalledWith(thrown, finding);
    expect(JSON.stringify([session.diagnostics, session.getSnapshot()])).not.toContain('SENTINEL');
    for (const spy of console_) expect(spy).not.toHaveBeenCalled();
    expect(set(session, 'note', [{ kind: 'string', value: 'still live' }])).toEqual({ outcome: 'applied' });
  });

  it('hands a scorer the projection frozen, so it cannot change the session (AC-04.3.2, INV-V-04)', () => {
    const session = createSession(FORM, {
      scorers: {
        tamper: {
          inputs: ['interest'],
          score: (projection) => {
            (projection.nodes[0] as { answers: unknown }).answers = integer(99);
            return 'unreachable';
          },
        },
      },
    });
    set(session, 'interest', integer(1));
    expect(session.getSnapshot().scores).toEqual({ tamper: null });
    expect(session.getSnapshot().nodes[0]?.answers).toEqual(integer(1));
    expect(session.diagnostics.map((finding) => finding.code)).toEqual(['scorer-threw']);
  });

  it('refuses a command a scorer sends (ADR-0009, AC-6)', () => {
    const box: { session?: Session } = {};
    const sent: unknown[] = [];
    box.session = createSession(FORM, {
      scorers: {
        rogue: {
          inputs: ['interest'],
          score: () => sent.push(box.session?.dispatch({ type: 'SetAnswer', path: itemPath('note'), answers: [{ kind: 'string', value: 'x' }] })),
        },
      },
    });
    sent.length = 0;
    set(box.session, 'interest', integer(1));
    expect(sent).toEqual([{ outcome: 'refused', reason: 'collaborator-running' }]);
    expect(box.session.getSnapshot().nodes.find((node) => node.path === 'note')?.answers).toEqual([]);
  });

  it('is not in a snapshot, and is recomputed on restore', () => {
    const session = createSession(FORM, { scorers });
    set(session, 'interest', integer(2));
    const saved = snapshot(session);
    expect(JSON.stringify(saved)).not.toContain('total');
    expect(restoreSession(FORM, saved, { scorers }).getSnapshot().scores).toEqual({ total: 2 });
    expect(restoreSession(FORM, saved).getSnapshot().scores).toEqual({});
  });

  it.each([
    ['not a record', 'total'],
    ['an unknown linkId', { total: { inputs: ['nope'], score: total } }],
    ['no inputs', { total: { inputs: [], score: total } }],
    ['no function', { total: { inputs: ['interest'], score: 1 } }],
    ['an entry that is not an object', { total: null }],
  ])('rejects scorers with %s as invalid-options', (_, candidate) => {
    expect(() => createSession(FORM, { scorers: candidate as unknown as Scorers })).toThrow(new FhirqError('invalid-options'));
  });
});
