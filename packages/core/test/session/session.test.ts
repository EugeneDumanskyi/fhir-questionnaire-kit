import { describe, expect, it, vi } from 'vitest';

import {
  createSession,
  FhirqError,
  itemPath,
  type Command,
  type Questionnaire,
  type Session,
  type SessionChange,
  type SessionOptions,
} from '../../src/index.js';
import { recomputeTrace } from '../../src/session/trace.js';
import { AMOUNT, bool, questionnaire, SLICE, SMOKER, text } from '../slice.js';

const visiblePaths = (session: Session) => session.getSnapshot().nodes.map((node) => node.path);
const answersAt = (session: Session, path: string) => session.getSnapshot().nodes.find((node) => node.path === path)?.answers;
const eq = (question: string) => [{ question, operator: '=', answerBoolean: true }] as const;

describe('session creation from R4 JSON (AC-01.1.1, M2 plan D12)', () => {
  it('runs in Node with no DOM (NFR-C-04)', () => {
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);
  });

  it('settles enablement synchronously', () => {
    const session = createSession(SLICE);
    expect(visiblePaths(session)).toEqual([SMOKER]);
    expect(session.getSnapshot()).toMatchObject({ status: 'in-progress', cycle: 0, change: null, completionRefused: false });
    expect(session.getSnapshot().nodes[0]).toMatchObject({ answers: [], instances: [], issues: [], surfaced: false, item: { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?', required: false } });
  });

  it('returns the same snapshot reference until a cycle changes something', () => {
    const session = createSession(SLICE);
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });

  it('does not depend on declaration order (INV-S-06)', () => {
    const reversed = createSession(questionnaire([SLICE.item[1], SLICE.item[0]]));
    expect(visiblePaths(reversed)).toEqual([SMOKER]);
    reversed.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    expect(visiblePaths(reversed)).toEqual([AMOUNT, SMOKER]);
  });

  it('rejects in strict mode with every finding, and loads the same questionnaire leniently with diagnostics', () => {
    const broken = questionnaire([
      { linkId: 'file', type: 'attachment' },
      { linkId: 'b', type: 'string', enableWhen: eq('ghost') },
    ]);
    expect(() => createSession(broken)).toThrow(FhirqError);
    try {
      createSession(broken, { loadMode: 'strict' });
    } catch (error) {
      expect(error).toMatchObject({ code: 'definition-rejected', message: 'definition-rejected' });
      expect((error as FhirqError).findings.map((finding) => [finding.code, finding.path])).toEqual([
        ['unsupported-item-type', 'file'],
        ['dangling-condition', 'b'],
      ]);
    }
    const lenient = createSession(broken, { loadMode: 'lenient' });
    expect(lenient.diagnostics.map((finding) => finding.code)).toEqual(['unsupported-item-type', 'dangling-condition']);
    expect(visiblePaths(lenient)).toEqual([itemPath('file')]);
  });

  it('rejects what is not an R4 Questionnaire in both modes (INV-D-01)', () => {
    for (const loadMode of ['strict', 'lenient'] as const) {
      let thrown: unknown;
      try {
        createSession({ resourceType: 'Patient' } as unknown as Questionnaire, { loadMode });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(FhirqError);
      expect(thrown).toMatchObject({ code: 'definition-rejected', findings: [{ code: 'not-a-questionnaire' }] });
    }
  });

  it.each([
    ['a load mode it does not know', { loadMode: 'loose' }],
    ['a retention policy it does not know', { retention: 'keep' }],
    ['host identity that is not an object', { hostIdentity: 'Patient/1' }],
    ['options that are not an object', 'strict'],
    ['null options', null],
  ])('refuses %s as an integration error', (_, options) => {
    expect(() => createSession(SLICE, options as unknown as SessionOptions)).toThrow(new FhirqError('invalid-options'));
  });

  it('accepts host identity without reading it (INV-S-32)', () => {
    const hostIdentity = { subject: { reference: 'Patient/1' } };
    expect(() => createSession(SLICE, { hostIdentity, retention: 'discard', loadMode: 'lenient' })).not.toThrow();
  });
});

describe('one command, one cycle, one notification (INV-S-33)', () => {
  it('shows the gated item and reports it once', () => {
    const session = createSession(SLICE);
    const listener = vi.fn<(change: SessionChange) => void>();
    session.subscribe(listener);

    expect(session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) })).toEqual({ outcome: 'applied' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toEqual({ command: 'SetAnswer', enabled: [AMOUNT], disabled: [], surfaced: [], added: [], removed: [], completion: null, responseChanged: true });
    expect(visiblePaths(session)).toEqual([SMOKER, AMOUNT]);
    expect(session.getSnapshot().cycle).toBe(1);
  });

  it('notifies nothing for a cycle that changes nothing', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();

    expect(session.dispatch({ type: 'NoteItemLeft', path: SMOKER })).toEqual({ outcome: 'unchanged' });
    expect(session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) })).toEqual({ outcome: 'unchanged' });

    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
  });

  it('keeps the object identity of nodes that did not change', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    const [smoker, amount] = session.getSnapshot().nodes;

    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('5') });
    const [smokerAfter, amountAfter] = session.getSnapshot().nodes;

    expect(smokerAfter).toBe(smoker);
    expect(amountAfter).not.toBe(amount);
    expect(amountAfter?.answers).toEqual(text('5'));
  });

  it('defers a command issued by a listener to its own cycle', () => {
    const session = createSession(SLICE);
    const seen: SessionChange['command'][] = [];
    const results: unknown[] = [];
    session.subscribe((change) => {
      seen.push(change.command);
      if (change.command === 'SetAnswer' && change.enabled.length > 0) {
        results.push(session.dispatch({ type: 'NoteItemLeft', path: AMOUNT }));
        expect(session.getSnapshot().change?.command).toBe('SetAnswer');
      }
    });

    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });

    expect(results).toEqual([{ outcome: 'deferred' }]);
    expect(seen).toEqual(['SetAnswer', 'NoteItemLeft']);
    expect(session.getSnapshot().nodes[1]?.surfaced).toBe(true);
  });

  it('turns a throwing listener into a diagnostic and still notifies the rest', () => {
    const session = createSession(SLICE);
    const after = vi.fn();
    session.subscribe(() => {
      throw new Error('host bug');
    });
    session.subscribe(after);

    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });

    expect(after).toHaveBeenCalledTimes(1);
    expect(session.diagnostics).toEqual([{ code: 'listener-threw', severity: 'warning', path: null, related: [], detail: null }]);
  });

  it('stops notifying after unsubscribe', () => {
    const session = createSession(SLICE);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    unsubscribe();
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    expect(listener).not.toHaveBeenCalled();
  });

  it('copies answers, so a host mutating what it dispatched cannot reach engine state', () => {
    const session = createSession(questionnaire([{ linkId: 'kind', type: 'choice', answerOption: [{ valueCoding: { system: 'urn:k', code: 'a' } }] }]));
    const coding = { system: 'urn:k', code: 'a', display: 'A', userSelected: true };
    session.dispatch({ type: 'SetAnswer', path: itemPath('kind'), answers: [{ kind: 'coding', value: coding }] });
    coding.code = 'b';
    expect(answersAt(session, 'kind')).toEqual([{ kind: 'coding', value: { system: 'urn:k', code: 'a', display: 'A' } }]);
    expect(Object.isFrozen(answersAt(session, 'kind')?.[0])).toBe(true);
  });
});

describe('refused commands are no-op cycles with a reason (04-domain.md §7.1)', () => {
  const form = questionnaire([
    { linkId: 'smoker', type: 'boolean' },
    { linkId: 'amount', type: 'string', enableWhen: eq('smoker') },
    { linkId: 'note', type: 'display', text: 'Thanks' },
    { linkId: 'weight', type: 'decimal', extension: [{ url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression', valueExpression: { language: 'text/fhirpath', expression: '1' } }] },
    { linkId: 'colours', type: 'string', repeats: true },
    { linkId: 'story', type: 'text' },
    { linkId: 'kind', type: 'choice', answerOption: [{ valueString: 'x' }] },
    { linkId: 'other', type: 'open-choice', answerOption: [{ valueCoding: { code: 'x' } }] },
  ]);

  it.each([
    ['a disabled node (INV-S-14, ADR-0002)', { type: 'SetAnswer', path: AMOUNT, answers: text('5') }, 'node-disabled'],
    ['clearing a disabled node', { type: 'ClearAnswer', path: AMOUNT }, 'node-disabled'],
    ['leaving a disabled node', { type: 'NoteItemLeft', path: AMOUNT }, 'node-disabled'],
    ['an unknown path', { type: 'ClearAnswer', path: itemPath('nope') }, 'unknown-path'],
    ['a display item', { type: 'SetAnswer', path: itemPath('note'), answers: text('x') }, 'not-answerable'],
    ['a calculated item (INV-S-15, ADR-0003)', { type: 'SetAnswer', path: itemPath('weight'), answers: [{ kind: 'decimal', value: 1 }] }, 'node-calculated'],
    ['clearing a calculated item', { type: 'ClearAnswer', path: itemPath('weight') }, 'node-calculated'],
    ['no answers at all', { type: 'SetAnswer', path: SMOKER, answers: [] }, 'empty-answers'],
    ['two answers on a non-repeating item (INV-S-11)', { type: 'SetAnswer', path: SMOKER, answers: [...bool(true), ...bool(false)] }, 'too-many-answers'],
    ['an answer of the wrong kind (INV-S-10)', { type: 'SetAnswer', path: SMOKER, answers: text('yes') }, 'type-mismatch'],
    ['a kind the choice options do not have', { type: 'SetAnswer', path: itemPath('kind'), answers: [{ kind: 'coding', value: { code: 'x' } }] }, 'type-mismatch'],
    ['an empty string, which FHIR cannot carry', { type: 'SetAnswer', path: itemPath('colours'), answers: text('') }, 'invalid-answer'],
    ['an answer that is not an answer', { type: 'SetAnswer', path: SMOKER, answers: [{ kind: 'boolean', value: 'yes' }] }, 'invalid-answer'],
  ] as const)('refuses %s', (_, command, reason) => {
    const session = createSession(form);
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();

    expect(session.dispatch(command as unknown as Command)).toEqual({ outcome: 'refused', reason });

    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
  });

  it.each([null, 'SetAnswer', {}, { type: 'Explode' }, { type: 'SetAnswer', path: 'smoker' }, { type: 'SetAnswer', answers: [] }, { type: 'ClearAnswer' }])(
    'refuses the malformed command %j without throwing',
    (command) => {
      const session = createSession(form);
      expect(session.dispatch(command as unknown as Command)).toEqual({ outcome: 'refused', reason: 'malformed-command' });
    },
  );

  it('accepts several answers on a repeating item, free text on an open choice, and an option kind on a choice', () => {
    const session = createSession(form);
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('colours'), answers: [...text('red'), ...text('blue')] })).toEqual({ outcome: 'applied' });
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('other'), answers: text('something else') })).toEqual({ outcome: 'applied' });
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('kind'), answers: text('x') })).toEqual({ outcome: 'applied' });
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('story'), answers: text('long') })).toEqual({ outcome: 'applied' });
    expect(answersAt(session, 'colours')).toEqual([...text('red'), ...text('blue')]);
  });

  it('refuses every answer command once completed (INV-S-31)', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });
    for (const command of [{ type: 'SetAnswer', path: SMOKER, answers: bool(true) }, { type: 'ClearAnswer', path: SMOKER }, { type: 'NoteItemLeft', path: SMOKER }, { type: 'RequestCompletion' }] as const) {
      expect(session.dispatch(command)).toEqual({ outcome: 'refused', reason: 'session-completed' });
    }
  });
});

describe('enablement and retention (SM-02)', () => {
  const chain = questionnaire([
    { linkId: 'smoker', type: 'boolean' },
    { linkId: 'amount', type: 'string', enableWhen: eq('smoker') },
    { linkId: 'heavy', type: 'boolean', enableWhen: [{ question: 'amount', operator: '=', answerString: '20' }] },
  ]);

  it('retains a hidden answer out of sight and shows it again (INV-S-12)', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('5') });

    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
    expect(session.getSnapshot().change).toMatchObject({ disabled: [AMOUNT], responseChanged: true });
    expect(visiblePaths(session)).toEqual([SMOKER]);

    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    expect(answersAt(session, AMOUNT)).toEqual(text('5'));
  });

  it('restores a retained answer through several hide-and-show cycles, unchanged (ADR-0002)', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('5') });
    const retained = answersAt(session, AMOUNT);
    for (let round = 0; round < 3; round += 1) {
      session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
      expect(session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('6') })).toEqual({ outcome: 'refused', reason: 'node-disabled' });
      session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    }
    expect(answersAt(session, AMOUNT)).toBe(retained);
  });

  it('erases a hidden answer in the same cycle under discard, and restores nothing (INV-S-13)', () => {
    const session = createSession(SLICE, { retention: 'discard' });
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('5') });
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    expect(answersAt(session, AMOUNT)).toEqual([]);
  });

  it('never lets a retained answer satisfy a condition, so a chain collapses in one cycle (INV-S-04, AC-02.2.1)', () => {
    const session = createSession(chain);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('20') });
    expect(visiblePaths(session)).toHaveLength(3);
    const listener = vi.fn();
    session.subscribe(listener);

    session.dispatch({ type: 'ClearAnswer', path: SMOKER });

    expect(visiblePaths(session)).toEqual([SMOKER]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().change?.disabled).toEqual([AMOUNT, itemPath('heavy')]);
  });

  it('combines conditions under enableBehavior any (INV-S-02)', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'a', type: 'boolean' },
        { linkId: 'b', type: 'boolean' },
        { linkId: 'c', type: 'string', enableBehavior: 'any', enableWhen: [...eq('a'), ...eq('b')] },
      ]),
    );
    session.dispatch({ type: 'SetAnswer', path: itemPath('b'), answers: bool(true) });
    expect(visiblePaths(session)).toContain(itemPath('c'));
  });

  it('disables a group subtree and re-applies each descendant own condition on re-enable (INV-S-01, INV-S-03)', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'on', type: 'boolean' },
        {
          linkId: 'g',
          type: 'group',
          enableWhen: eq('on'),
          item: [
            { linkId: 'inner', type: 'boolean' },
            { linkId: 'deep', type: 'string', enableWhen: eq('inner') },
          ],
        },
      ]),
    );
    session.dispatch({ type: 'SetAnswer', path: itemPath('on'), answers: bool(true) });
    expect(visiblePaths(session)).toEqual(['on', 'g', 'g/inner']);
    session.dispatch({ type: 'SetAnswer', path: itemPath('g', 'inner'), answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: itemPath('on'), answers: bool(false) });
    expect(session.getSnapshot().change?.disabled).toEqual(['g', 'g/inner', 'g/deep']);
    session.dispatch({ type: 'SetAnswer', path: itemPath('on'), answers: bool(true) });
    expect(visiblePaths(session)).toEqual(['on', 'g', 'g/inner', 'g/deep']);
  });

  it('shows a != dependent while its question is disabled, per the R4 operator text (M2 plan D2)', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'gate', type: 'boolean' },
        { linkId: 'smoker', type: 'boolean', enableWhen: eq('gate') },
        { linkId: 'reason', type: 'string', enableWhen: [{ question: 'smoker', operator: '!=', answerBoolean: true }] },
      ]),
    );
    expect(visiblePaths(session)).toEqual(['gate', 'reason']);
  });
});

describe('repeat instances and scoped conditions (INV-S-08, INV-S-24)', () => {
  const meds = questionnaire([
    { linkId: 'any', type: 'boolean' },
    {
      linkId: 'meds',
      type: 'group',
      repeats: true,
      enableWhen: eq('any'),
      item: [
        { linkId: 'name', type: 'string' },
        { linkId: 'taking', type: 'boolean' },
        { linkId: 'dose', type: 'string', enableWhen: eq('taking') },
      ],
    },
  ]);

  it('starts a repeating group with one empty instance, addressed by ordinal', () => {
    const session = createSession(meds);
    session.dispatch({ type: 'SetAnswer', path: itemPath('any'), answers: bool(true) });
    expect(visiblePaths(session)).toEqual(['any', 'meds', 'meds[0]/name', 'meds[0]/taking']);
    expect(session.getSnapshot().nodes[1]?.instances).toEqual([0]);
  });

  it('resolves a sibling condition inside the instance', () => {
    const session = createSession(meds);
    session.dispatch({ type: 'SetAnswer', path: itemPath('any'), answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: itemPath('meds', 0, 'taking'), answers: bool(true) });
    expect(visiblePaths(session)).toContain('meds[0]/dose');
  });
});

describe('surfacing: quiet, then live, never back (SM-03)', () => {
  const answeredSmoker = () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    return session;
  };
  const amount = (session: Session) => session.getSnapshot().nodes[1];

  it('holds an issue quietly until the respondent leaves the item', () => {
    const session = answeredSmoker();
    expect(amount(session)).toMatchObject({ issues: [{ code: 'required' }], surfaced: false });

    expect(session.dispatch({ type: 'NoteItemLeft', path: AMOUNT })).toEqual({ outcome: 'applied' });

    expect(amount(session)?.surfaced).toBe(true);
    expect(session.getSnapshot().change).toMatchObject({ surfaced: [AMOUNT], responseChanged: false });
  });

  it('stays live after the issue is fixed, hidden and shown again', () => {
    const session = answeredSmoker();
    session.dispatch({ type: 'NoteItemLeft', path: AMOUNT });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('5') });
    expect(amount(session)).toMatchObject({ issues: [], surfaced: true });

    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    session.dispatch({ type: 'ClearAnswer', path: AMOUNT });

    expect(amount(session)).toMatchObject({ issues: [{ code: 'required' }], surfaced: true });
  });

  it('does not surface anything when the item left has no issue', () => {
    const session = answeredSmoker();
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, answers: text('5') });
    expect(session.dispatch({ type: 'NoteItemLeft', path: AMOUNT })).toEqual({ outcome: 'unchanged' });
    expect(session.dispatch({ type: 'ClearAnswer', path: SMOKER })).toEqual({ outcome: 'applied' });
    expect(session.dispatch({ type: 'ClearAnswer', path: SMOKER })).toEqual({ outcome: 'unchanged' });
  });
});

describe('completion (SM-01)', () => {
  it('refuses with errors, surfaces every issue and notifies each time', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(true) });
    const listener = vi.fn<(change: SessionChange) => void>();
    session.subscribe(listener);

    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'refused', reason: 'validation-errors' });
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'refused', reason: 'validation-errors' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ completion: 'refused', surfaced: [AMOUNT] });
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ completion: 'refused', surfaced: [] });
    expect(session.getSnapshot()).toMatchObject({ status: 'in-progress', completionRefused: true, cycle: 3 });
  });

  it('ignores a disabled required item (INV-V-01) and a required group, then completes', () => {
    const session = createSession(questionnaire([...SLICE.item, { linkId: 'g', type: 'group', required: true, item: [{ linkId: 'x', type: 'string' }] }]));
    session.dispatch({ type: 'SetAnswer', path: SMOKER, answers: bool(false) });
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot()).toMatchObject({ status: 'completed', change: { completion: 'completed' } });
  });
});

describe('the recompute trace (ADR-0009, NFR-P-09; internal)', () => {
  it('records only what the changed answer can reach', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'a', type: 'boolean' },
        { linkId: 'b', type: 'string', enableWhen: eq('a') },
        { linkId: 'unrelated', type: 'boolean' },
        { linkId: 'c', type: 'string', enableWhen: eq('unrelated') },
      ]),
    );
    expect(recomputeTrace(session)).toEqual([]);
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });
    expect(recomputeTrace(session)).toEqual(['b']);
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('a') });
    expect(recomputeTrace(session)).toEqual([]);
  });
});
