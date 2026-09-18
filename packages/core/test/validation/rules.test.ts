import { describe, expect, it, vi } from 'vitest';

import { createSession, FhirqError, itemPath, type Answer, type ItemPath, type Questionnaire, type Session, type SessionOptions } from '../../src/index.js';
import { bool, questionnaire, text } from '../slice.js';

type Rules = NonNullable<SessionOptions['rules']>;
type Check = Rules[number]['check'];

const at = (path: string) => path as ItemPath;
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: at(path), answers });
const integer = (value: number): Answer[] => [{ kind: 'integer', value }];
const value = (answers: readonly Answer[] | undefined): unknown => answers?.[0]?.value;
const none = (): null => null;
const issues = (session: Session) => session.getSnapshot().issues.map((issue) => [issue.path, issue.code, issue.message, issue.severity]);

/** Systolic above diastolic, per reading; a reading repeats. */
const BLOOD_PRESSURE: Questionnaire = questionnaire([
  { linkId: 'measured', type: 'boolean' },
  {
    linkId: 'reading',
    type: 'group',
    repeats: true,
    enableWhen: [{ question: 'measured', operator: '=', answerBoolean: true }],
    item: [
      { linkId: 'systolic', type: 'integer' },
      { linkId: 'diastolic', type: 'integer' },
    ],
  },
]);

const aboveDiastolic: Check = (answers) => {
  const systolic = value(answers['systolic']);
  const diastolic = value(answers['diastolic']);
  return typeof systolic === 'number' && typeof diastolic === 'number' && systolic <= diastolic ? 'bp-order' : null;
};

describe('cross-field rules (US-04.3, M3 plan D5)', () => {
  it('runs once per shared repeat instance and attaches to each input there (AC-04.3.1, INV-D-13 scoping)', () => {
    const check = vi.fn(aboveDiastolic);
    const session = createSession(BLOOD_PRESSURE, { rules: [{ inputs: ['systolic', 'diastolic'], check }] });
    set(session, 'measured', bool(true));
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('reading') });
    set(session, 'reading[1]/systolic', integer(80));
    set(session, 'reading[1]/diastolic', integer(90));
    set(session, 'reading[0]/systolic', integer(120));
    set(session, 'reading[0]/diastolic', integer(80));
    expect(issues(session)).toEqual([
      ['reading[1]/systolic', 'rule', 'bp-order', 'error'],
      ['reading[1]/diastolic', 'rule', 'bp-order', 'error'],
    ]);
    expect(check).toHaveBeenCalledWith({ systolic: integer(120), diastolic: integer(80) });
    expect(check).toHaveBeenLastCalledWith({ systolic: integer(80), diastolic: integer(90) });
  });

  it('is skipped wherever an item it names is disabled, never run on a retained answer (INV-V-03, AC-04.3.3)', () => {
    const check = vi.fn(aboveDiastolic);
    const session = createSession(BLOOD_PRESSURE, { rules: [{ inputs: ['measured', 'systolic', 'diastolic'], check }] });
    set(session, 'measured', bool(true));
    set(session, 'reading[0]/systolic', integer(80));
    set(session, 'reading[0]/diastolic', integer(90));
    expect(issues(session)).toHaveLength(3);
    check.mockClear();
    set(session, 'measured', bool(false));
    expect(check).not.toHaveBeenCalled();
    expect(issues(session)).toEqual([]);
  });

  it.each([
    ['an input', ['a', 'b'], ['b']],
    ['a target', ['b'], ['a']],
  ])('is skipped when %s is disabled while its context stays enabled (INV-V-03)', (_, inputs, targets) => {
    const check = vi.fn((): string => 'always');
    const session = createSession(
      questionnaire([
        { linkId: 'gate', type: 'boolean' },
        { linkId: 'a', type: 'integer', enableWhen: [{ question: 'gate', operator: '=', answerBoolean: true }] },
        { linkId: 'b', type: 'integer' },
      ]),
      { rules: [{ inputs, targets, check }] },
    );
    set(session, 'gate', bool(true));
    expect(issues(session)).toEqual(targets.map((target) => [target, 'rule', 'always', 'error']));
    check.mockClear();
    set(session, 'gate', bool(false));
    expect(check).not.toHaveBeenCalled();
    expect(issues(session)).toEqual([]);
    expect(session.diagnostics.filter((finding) => finding.code === 'rule-threw')).toEqual([]);
  });

  it('attaches to its targets, or to the form when they are empty; form-level issues come first and have no path (INV-V-06)', () => {
    const session = createSession(BLOOD_PRESSURE, {
      rules: [
        { inputs: ['systolic', 'diastolic'], targets: ['diastolic'], check: aboveDiastolic },
        { inputs: ['measured'], targets: [], check: (answers) => (value(answers['measured']) === false ? 'not-measured' : null) },
      ],
    });
    set(session, 'measured', bool(true));
    set(session, 'reading[0]/systolic', integer(80));
    set(session, 'reading[0]/diastolic', integer(90));
    expect(issues(session)).toEqual([['reading[0]/diastolic', 'rule', 'bp-order', 'error']]);
    set(session, 'measured', bool(false));
    expect(session.getSnapshot().issues).toEqual([
      { code: 'rule', severity: 'error', path: null, linkId: null, message: 'not-measured', params: {} },
    ]);
  });

  it('lets a warning through completion and blocks on an error (INV-S-30)', () => {
    const warn = createSession(BLOOD_PRESSURE, { rules: [{ inputs: ['measured'], targets: [], severity: 'warning', check: () => 'check-again' }] });
    expect(issues(warn)).toEqual([[null, 'rule', 'check-again', 'warning']]);
    expect(warn.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });

    const error = createSession(BLOOD_PRESSURE, { rules: [{ inputs: ['measured'], targets: [], check: () => 'blocked' }] });
    expect(error.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'refused', reason: 'validation-errors' });
    expect(error.getSnapshot()).toMatchObject({ status: 'in-progress', completionRefused: true });
  });

  it('reads items outside the repeat from inside each instance', () => {
    const session = createSession(BLOOD_PRESSURE, {
      rules: [{ inputs: ['measured', 'systolic'], targets: ['systolic'], check: (answers) => (answers['systolic']?.length === 0 ? 'missing' : null) }],
    });
    set(session, 'measured', bool(true));
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('reading') });
    set(session, 'reading[0]/systolic', integer(120));
    expect(issues(session)).toEqual([['reading[1]/systolic', 'rule', 'missing', 'error']]);
  });

  it('turns a throwing rule into a diagnostic without the thrown text, once per rule, and keeps the cycle (INV-V-05)', () => {
    const session = createSession(BLOOD_PRESSURE, {
      rules: [
        {
          inputs: ['measured'],
          check: () => {
            throw new Error('SENTINEL-VALUE');
          },
        },
      ],
    });
    expect(set(session, 'measured', bool(true))).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot().issues).toEqual([]);
    const thrown = session.diagnostics.filter((finding) => finding.code === 'rule-threw');
    expect(thrown).toEqual([{ code: 'rule-threw', severity: 'warning', path: null, related: [], detail: 'rules[0]' }]);
    expect(JSON.stringify(session.diagnostics)).not.toContain('SENTINEL');
  });

  it('hands a rule frozen answers, so it cannot change the session (INV-V-04)', () => {
    let tried = false;
    const session = createSession(BLOOD_PRESSURE, {
      rules: [
        {
          inputs: ['measured'],
          check: (answers) => {
            tried = true;
            (answers as Record<string, unknown>)['measured'] = text('changed');
            return null;
          },
        },
      ],
    });
    set(session, 'measured', bool(true));
    expect(tried).toBe(true);
    expect(session.getSnapshot().nodes[0]?.answers).toEqual(bool(true));
    expect(session.diagnostics.map((finding) => finding.code)).toContain('rule-threw');
  });

  it('ignores a return that is not a message key', () => {
    const session = createSession(BLOOD_PRESSURE, { rules: [{ inputs: ['measured'], check: () => '' }] });
    expect(issues(session)).toEqual([]);
  });

  it.each([
    ['not an array', 'rule'],
    ['an unknown linkId', [{ inputs: ['nope'], check: none }]],
    ['no inputs', [{ inputs: [], check: none }]],
    ['a non-string input', [{ inputs: [1], check: none }]],
    ['no check', [{ inputs: ['measured'] }]],
    ['a bad severity', [{ inputs: ['measured'], severity: 'fatal', check: none }]],
    ['a bad target', [{ inputs: ['measured'], targets: ['nope'], check: none }]],
    ['targets not a list', [{ inputs: ['measured'], targets: 'measured', check: none }]],
    ['a rule that is not an object', [null]],
  ])('refuses rules with %s as invalid-options', (_, rules) => {
    expect(() => createSession(BLOOD_PRESSURE, { rules } as unknown as SessionOptions)).toThrow(new FhirqError('invalid-options'));
  });

  it('refuses a rule whose items sit in repeats that share no instance', () => {
    const q = questionnaire([
      { linkId: 'a', type: 'group', repeats: true, item: [{ linkId: 'x', type: 'string' }] },
      { linkId: 'b', type: 'group', repeats: true, item: [{ linkId: 'y', type: 'string' }] },
    ]);
    expect(() => createSession(q, { rules: [{ inputs: ['x', 'y'], check: () => null }] })).toThrow(FhirqError);
  });

  it('scopes to the innermost of nested repeats', () => {
    const q = questionnaire([
      {
        linkId: 'outer',
        type: 'group',
        repeats: true,
        item: [
          { linkId: 'label', type: 'string' },
          { linkId: 'inner', type: 'group', repeats: true, item: [{ linkId: 'v', type: 'string' }] },
        ],
      },
    ]);
    const session = createSession(q, { rules: [{ inputs: ['label', 'v'], targets: ['v'], check: (answers) => (value(answers['label']) === value(answers['v']) ? 'same' : null) }] });
    set(session, 'outer[0]/label', text('x'));
    session.dispatch({ type: 'AddRepeatInstance', path: at('outer[0]/inner') });
    set(session, 'outer[0]/inner[1]/v', text('x'));
    set(session, 'outer[0]/inner[0]/v', text('y'));
    expect(issues(session)).toEqual([['outer[0]/inner[1]/v', 'rule', 'same', 'error']]);
  });
});

describe('surfacing (SM-03, D4)', () => {
  const REQUIRED: Questionnaire = questionnaire([
    { linkId: 'gate', type: 'boolean' },
    { linkId: 'name', type: 'string', required: true, enableWhen: [{ question: 'gate', operator: '=', answerBoolean: true }] },
    { linkId: 'other', type: 'string', required: true },
  ]);
  const surfaced = (session: Session) => session.getSnapshot().nodes.filter((node) => node.surfaced).map((node) => node.path);

  it('surfaces a cross-field issue on each target by that target own timing (AC-04.3.4)', () => {
    const session = createSession(REQUIRED, { rules: [{ inputs: ['gate', 'other'], targets: ['other'], check: () => 'pair' }] });
    expect(surfaced(session)).toEqual([]);
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('gate') });
    expect(surfaced(session)).toEqual([]);
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('other') });
    expect(surfaced(session)).toEqual(['other']);
  });

  it('surfaces every node with an issue on a refused completion, whatever its severity, and never reverts (AC-04.2.4)', () => {
    const session = createSession(REQUIRED, { rules: [{ inputs: ['gate'], severity: 'warning', check: () => 'note' }] });
    set(session, 'gate', bool(true));
    const change = vi.fn();
    session.subscribe(change);
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'refused', reason: 'validation-errors' });
    expect(change.mock.calls[0]?.[0]).toMatchObject({ completion: 'refused', surfaced: ['gate', 'name', 'other'] });
    set(session, 'gate', bool(false));
    set(session, 'gate', bool(true));
    set(session, 'name', text('fixed'));
    expect(surfaced(session)).toEqual(['gate', 'name', 'other']);
  });

  it('notifies when only a form-level issue changes, since no node carries it', () => {
    const session = createSession(REQUIRED, {
      rules: [{ inputs: ['gate'], targets: [], check: (answers) => (value(answers['gate']) === true ? 'form' : null) }],
    });
    const change = vi.fn();
    session.subscribe(change);
    expect(set(session, 'gate', bool(true))).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot().issues.map((issue) => issue.message)).toEqual(['form', 'required', 'required']);
    expect(change).toHaveBeenCalledTimes(1);
  });
});
