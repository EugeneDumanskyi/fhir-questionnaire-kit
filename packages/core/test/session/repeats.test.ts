import { describe, expect, it, vi } from 'vitest';

import { createSession, itemPath, type Command, type ItemPath, type Questionnaire, type Session } from '../../src/index.js';
import { recomputeTrace } from '../../src/session/trace.js';
import { bool, questionnaire, text } from '../slice.js';

const MAX = 'http://hl7.org/fhir/StructureDefinition/questionnaire-maxOccurs';
const MIN = 'http://hl7.org/fhir/StructureDefinition/questionnaire-minOccurs';
const eq = (question: string) => [{ question, operator: '=', answerBoolean: true }] as const;

const paths = (session: Session) => session.getSnapshot().nodes.map((node) => node.path);
const node = (session: Session, path: string) => session.getSnapshot().nodes.find((candidate) => candidate.path === path);
/** Paths here are written as the snapshot reports them, so they are used as they are, not rebuilt. */
const at = (path: string) => path as ItemPath;
const add = (session: Session, path: string) => session.dispatch({ type: 'AddRepeatInstance', path: at(path) });
const remove = (session: Session, path: string, ordinal: number) => session.dispatch({ type: 'RemoveRepeatInstance', path: at(path), ordinal });
const set = (session: Session, path: string, value: boolean | string) =>
  session.dispatch({ type: 'SetAnswer', path: at(path), answers: typeof value === 'boolean' ? bool(value) : text(value) });

/** A medication list: a repeating group whose dose shows when "taking" is answered yes in the same instance. */
const MEDS: Questionnaire = questionnaire([
  { linkId: 'reviewed', type: 'boolean' },
  {
    linkId: 'meds',
    type: 'group',
    repeats: true,
    extension: [{ url: MAX, valueInteger: 3 }, { url: MIN, valueInteger: 1 }],
    item: [
      { linkId: 'name', type: 'string' },
      { linkId: 'taking', type: 'boolean' },
      { linkId: 'dose', type: 'string', enableWhen: eq('taking') },
      { linkId: 'checked', type: 'boolean', enableWhen: eq('reviewed') },
    ],
  },
]);

describe('adding and removing instances (SM-05, AC-03.2.1, AC-03.2.2)', () => {
  it('adds an empty instance with the next ordinal, reported as added in one notification', () => {
    const session = createSession(MEDS);
    const listener = vi.fn();
    session.subscribe(listener);

    expect(add(session, 'meds')).toEqual({ outcome: 'applied' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().change).toMatchObject({ added: ['meds[1]'], removed: [], enabled: [], disabled: [], responseChanged: false });
    expect(node(session, 'meds')?.instances).toEqual([0, 1]);
    expect(paths(session)).toEqual(['reviewed', 'meds', 'meds[0]/name', 'meds[0]/taking', 'meds[1]/name', 'meds[1]/taking']);
  });

  it('removes the second of three, keeps order, closes positions and never reuses the ordinal (INV-S-20, INV-S-21, INV-S-25)', () => {
    const session = createSession(MEDS);
    add(session, 'meds');
    add(session, 'meds');
    set(session, 'meds[1]/name', 'aspirin');
    set(session, 'meds[2]/name', 'statin');

    expect(remove(session, 'meds', 1)).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot().change).toMatchObject({ removed: ['meds[1]'], added: [], responseChanged: true });
    expect(node(session, 'meds')?.instances).toEqual([0, 2]);
    expect(node(session, 'meds[2]/name')?.answers).toEqual(text('statin'));
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('meds', 1, 'name'), answers: text('x') })).toEqual({ outcome: 'refused', reason: 'unknown-path' });

    add(session, 'meds');
    expect(node(session, 'meds')?.instances).toEqual([0, 2, 3]);
    expect(node(session, 'meds[3]/name')?.answers).toEqual([]);
  });

  it('refuses Add at maxOccurs and never refuses Remove on cardinality, down to no instances (INV-S-22, INV-S-23)', () => {
    const session = createSession(MEDS);
    add(session, 'meds');
    add(session, 'meds');
    expect(add(session, 'meds')).toEqual({ outcome: 'refused', reason: 'at-max-occurs' });
    for (const ordinal of [0, 1, 2]) expect(remove(session, 'meds', ordinal)).toEqual({ outcome: 'applied' });
    expect(node(session, 'meds')?.instances).toEqual([]);
    expect(paths(session)).toEqual(['reviewed', 'meds']);
    expect(add(session, 'meds')).toEqual({ outcome: 'applied' });
    expect(node(session, 'meds')?.instances).toEqual([3]);
  });

  it.each([
    ['a group that does not repeat', { type: 'AddRepeatInstance', path: 'about' }, 'not-repeating'],
    ['a question', { type: 'AddRepeatInstance', path: 'on' }, 'not-repeating'],
    ['an ordinal that is not live', { type: 'RemoveRepeatInstance', path: 'meds', ordinal: 7 }, 'unknown-instance'],
    ['a disabled group (ADR-0002)', { type: 'AddRepeatInstance', path: 'gated' }, 'node-disabled'],
    ['removing from a disabled group', { type: 'RemoveRepeatInstance', path: 'gated', ordinal: 0 }, 'node-disabled'],
    ['an unknown group', { type: 'AddRepeatInstance', path: 'nope' }, 'unknown-path'],
  ] as const)('refuses %s', (_, command, reason) => {
    const session = createSession(
      questionnaire([
        { linkId: 'on', type: 'boolean' },
        { linkId: 'about', type: 'group', item: [{ linkId: 'x', type: 'string' }] },
        { linkId: 'meds', type: 'group', repeats: true, item: [{ linkId: 'name', type: 'string' }] },
        { linkId: 'gated', type: 'group', repeats: true, enableWhen: eq('on'), item: [{ linkId: 'y', type: 'string' }] },
      ]),
    );
    const before = session.getSnapshot();
    expect(session.dispatch(command as unknown as Command)).toEqual({ outcome: 'refused', reason });
    expect(session.getSnapshot()).toBe(before);
  });

  it.each([{ type: 'RemoveRepeatInstance', path: 'meds' }, { type: 'RemoveRepeatInstance', path: 'meds', ordinal: '1' }, { type: 'AddRepeatInstance' }])(
    'refuses the malformed %j',
    (command) => {
      expect(createSession(MEDS).dispatch(command as unknown as Command)).toEqual({ outcome: 'refused', reason: 'malformed-command' });
    },
  );

  it('refuses both once completed (INV-S-31)', () => {
    const session = createSession(questionnaire([{ linkId: 'meds', type: 'group', repeats: true, item: [{ linkId: 'name', type: 'string' }] }]));
    session.dispatch({ type: 'RequestCompletion' });
    expect(add(session, 'meds')).toEqual({ outcome: 'refused', reason: 'session-completed' });
    expect(remove(session, 'meds', 0)).toEqual({ outcome: 'refused', reason: 'session-completed' });
  });

  it('gives a nested repeating group its own default instance in every new outer instance (INV-S-24)', () => {
    const session = createSession(
      questionnaire([{ linkId: 'visit', type: 'group', repeats: true, item: [{ linkId: 'symptom', type: 'group', repeats: true, item: [{ linkId: 'what', type: 'string' }] }] }]),
    );
    add(session, 'visit');
    expect(paths(session)).toEqual(['visit', 'visit[0]/symptom', 'visit[0]/symptom[0]/what', 'visit[1]/symptom', 'visit[1]/symptom[0]/what']);
  });
});

describe('conditions resolve per instance (INV-S-08, AC-03.2.3, INV-D-13)', () => {
  it('answering the trigger in instance 2 changes only instance 2, and recomputes only there', () => {
    const session = createSession(MEDS);
    add(session, 'meds');
    add(session, 'meds');

    set(session, 'meds[1]/taking', true);

    expect(session.getSnapshot().change?.enabled).toEqual(['meds[1]/dose']);
    expect(paths(session).filter((path) => path.endsWith('/dose'))).toEqual(['meds[1]/dose']);
    expect(recomputeTrace(session)).toEqual(['meds[1]/dose']);
  });

  it('a question outside the repeat reaches every instance, including one added later', () => {
    const session = createSession(MEDS);
    add(session, 'meds');
    set(session, 'reviewed', true);
    expect(session.getSnapshot().change?.enabled).toEqual(['meds[0]/checked', 'meds[1]/checked']);
    add(session, 'meds');
    expect(paths(session)).toContain('meds[2]/checked');
    set(session, 'reviewed', false);
    expect(session.getSnapshot().change?.disabled).toEqual(['meds[0]/checked', 'meds[1]/checked', 'meds[2]/checked']);
  });

  it('an inner repeat reads its own enclosing outer instance, through a group that does not repeat', () => {
    const session = createSession(
      questionnaire([
        {
          linkId: 'visit',
          type: 'group',
          repeats: true,
          item: [
            { linkId: 'details', type: 'group', item: [{ linkId: 'ill', type: 'boolean' }] },
            { linkId: 'symptom', type: 'group', repeats: true, item: [{ linkId: 'what', type: 'string', enableWhen: eq('ill') }] },
          ],
        },
      ]),
    );
    add(session, 'visit');
    add(session, 'visit[1]/symptom');

    set(session, 'visit[1]/details/ill', true);

    expect(session.getSnapshot().change?.enabled).toEqual(['visit[1]/symptom[0]/what', 'visit[1]/symptom[1]/what']);
    expect(paths(session).filter((path) => path.endsWith('/what'))).toEqual(['visit[1]/symptom[0]/what', 'visit[1]/symptom[1]/what']);
  });

  it('holds several answers on a repeating question inside an instance (INV-S-11, INV-S-26)', () => {
    const session = createSession(questionnaire([{ linkId: 'meds', type: 'group', repeats: true, item: [{ linkId: 'times', type: 'string', repeats: true }] }]));
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('meds', 0, 'times'), answers: [...text('am'), ...text('pm')] })).toEqual({ outcome: 'applied' });
    expect(node(session, 'meds[0]/times')?.answers).toHaveLength(2);
  });
});

describe('retention and repeating groups (SM-02, SM-05, T5)', () => {
  const gated: Questionnaire = questionnaire([
    { linkId: 'any', type: 'boolean' },
    {
      linkId: 'meds',
      type: 'group',
      repeats: true,
      enableWhen: eq('any'),
      item: [
        { linkId: 'name', type: 'string' },
        { linkId: 'doses', type: 'group', repeats: true, item: [{ linkId: 'amount', type: 'string' }] },
      ],
    },
  ]);

  const filled = (retention: 'retain-exclude' | 'discard') => {
    const session = createSession(gated, { retention });
    set(session, 'any', true);
    add(session, 'meds');
    add(session, 'meds');
    set(session, 'meds[0]/name', 'a');
    set(session, 'meds[2]/name', 'c');
    add(session, 'meds[2]/doses');
    set(session, 'meds[2]/doses[1]/amount', '5 mg');
    return session;
  };

  it('keeps every instance and answer of a hidden group under retain-exclude', () => {
    const session = filled('retain-exclude');
    set(session, 'any', false);
    expect(paths(session)).toEqual(['any']);
    set(session, 'any', true);
    expect(node(session, 'meds')?.instances).toEqual([0, 1, 2]);
    expect(node(session, 'meds[2]/doses[1]/amount')?.answers).toEqual(text('5 mg'));
  });

  it('resets a hidden group to one empty instance in the same cycle under discard (AC-05.2.6)', () => {
    const session = filled('discard');
    const listener = vi.fn();
    session.subscribe(listener);

    set(session, 'any', false);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().change).toMatchObject({ disabled: ['meds'], responseChanged: true });
    set(session, 'any', true);
    expect(node(session, 'meds')?.instances).toEqual([3]);
    expect(paths(session)).toEqual(['any', 'meds', 'meds[3]/name', 'meds[3]/doses', 'meds[3]/doses[0]/amount']);
    expect(session.getSnapshot().nodes.every((state) => state.answers.length === 0 || state.path === 'any')).toBe(true);
  });

  it('skips nodes a reset destroyed after they were queued in the same cycle', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'any', type: 'boolean' },
        { linkId: 'meds', type: 'group', repeats: true, enableWhen: eq('any'), item: [{ linkId: 'note', type: 'string', enableWhen: eq('any') }] },
      ]),
      { retention: 'discard' },
    );
    set(session, 'any', true);
    add(session, 'meds');
    set(session, 'any', false);
    expect(recomputeTrace(session)).toEqual(['meds', 'meds[2]/note']);
    set(session, 'any', true);
    expect(paths(session)).toEqual(['any', 'meds', 'meds[2]/note']);
  });

  it('keeps the one instance of a hidden group under discard, and erases its answers', () => {
    const session = createSession(gated, { retention: 'discard' });
    set(session, 'any', true);
    set(session, 'meds[0]/name', 'a');
    set(session, 'any', false);
    set(session, 'any', true);
    expect(node(session, 'meds')?.instances).toEqual([0]);
    expect(node(session, 'meds[0]/name')?.answers).toEqual([]);
  });

  it('resets a repeating group hidden by its enclosing group, five levels down a cascade', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'q1', type: 'boolean' },
        { linkId: 'q2', type: 'boolean', enableWhen: eq('q1') },
        { linkId: 'q3', type: 'boolean', enableWhen: eq('q2') },
        { linkId: 'q4', type: 'boolean', enableWhen: eq('q3') },
        {
          linkId: 'outer',
          type: 'group',
          enableWhen: eq('q4'),
          item: [{ linkId: 'list', type: 'group', repeats: true, item: [{ linkId: 'q5', type: 'boolean' }, { linkId: 'q6', type: 'string', enableWhen: eq('q5') }] }],
        },
      ]),
      { retention: 'discard' },
    );
    for (const path of ['q1', 'q2', 'q3', 'q4']) set(session, path, true);
    add(session, 'outer/list');
    set(session, 'outer/list[1]/q5', true);
    set(session, 'outer/list[1]/q6', 'x');

    set(session, 'q1', false);

    expect(paths(session)).toEqual(['q1']);
    for (const path of ['q1', 'q2', 'q3', 'q4']) set(session, path, true);
    expect(node(session, 'outer/list')?.instances).toEqual([2]);
    expect(paths(session)).toEqual(['q1', 'q2', 'q3', 'q4', 'outer', 'outer/list', 'outer/list[2]/q5']);
  });
});
