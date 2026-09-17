import { describe, expect, it, vi } from 'vitest';

import { createSession, FhirqError, itemPath, type DefinitionInput, type SessionChange } from '../src/index.js';
import { AMOUNT, SLICE, SMOKER } from './slice.js';

const visiblePaths = (session: ReturnType<typeof createSession>) =>
  session.getSnapshot().nodes.map((node) => node.path);

describe('session creation', () => {
  it('runs in Node with no DOM (NFR-C-04)', () => {
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);
  });

  it('settles enablement synchronously (AC-01.1.1)', () => {
    const session = createSession(SLICE);
    expect(visiblePaths(session)).toEqual([SMOKER]);
    expect(session.getSnapshot()).toMatchObject({ status: 'in-progress', cycle: 0, change: null, completionRefused: false });
  });

  it('returns the same snapshot reference until a cycle changes something', () => {
    const session = createSession(SLICE);
    expect(session.getSnapshot()).toBe(session.getSnapshot());
  });

  it('does not depend on declaration order (INV-S-06)', () => {
    const reversed: DefinitionInput = { items: [...SLICE.items].reverse() };
    const session = createSession(reversed);
    expect(visiblePaths(session)).toEqual([SMOKER]);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    expect(visiblePaths(session)).toEqual([AMOUNT, SMOKER]);
  });

  it.each([
    ['a duplicate linkId', [{ linkId: 'a', type: 'boolean', text: 'A' }, { linkId: 'a', type: 'string', text: 'B' }]],
    ['a dangling condition', [{ linkId: 'a', type: 'string', text: 'A', enableWhen: [{ question: 'x', operator: '=', answer: true }] }]],
    ['a self-reference', [{ linkId: 'a', type: 'boolean', text: 'A', enableWhen: [{ question: 'a', operator: '=', answer: true }] }]],
    [
      'a condition answer of the wrong type',
      [{ linkId: 'a', type: 'boolean', text: 'A' }, { linkId: 'b', type: 'string', text: 'B', enableWhen: [{ question: 'a', operator: '=', answer: 'yes' }] }],
    ],
  ] as const)('rejects %s with a typed error naming the linkId only', (_, items) => {
    const attempt = () => createSession({ items });
    expect(attempt).toThrow(FhirqError);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({ code: 'definition-rejected', message: 'definition-rejected' });
      const [finding] = (error as FhirqError).findings;
      expect(['a', 'b']).toContain(finding?.path);
      expect(finding).toMatchObject({ severity: 'error', related: [], detail: null });
    }
  });
});

describe('one command, one cycle, one notification (INV-S-33)', () => {
  it('shows the gated item and reports it once', () => {
    const session = createSession(SLICE);
    const listener = vi.fn<(change: SessionChange) => void>();
    session.subscribe(listener);

    expect(session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true })).toEqual({ outcome: 'applied' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toEqual({
      command: 'SetAnswer',
      enabled: [AMOUNT],
      disabled: [],
      surfaced: [],
      completion: null,
      responseChanged: true,
    });
    expect(visiblePaths(session)).toEqual([SMOKER, AMOUNT]);
    expect(session.getSnapshot().cycle).toBe(1);
  });

  it('notifies nothing for a cycle that changes nothing', () => {
    const session = createSession(SLICE);
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();

    expect(session.dispatch({ type: 'NoteItemLeft', path: SMOKER })).toEqual({ outcome: 'unchanged' });

    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
  });

  it('keeps the object identity of nodes that did not change', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    const [smoker, amount] = session.getSnapshot().nodes;

    session.dispatch({ type: 'SetAnswer', path: AMOUNT, value: '5' });
    const [smokerAfter, amountAfter] = session.getSnapshot().nodes;

    expect(smokerAfter).toBe(smoker);
    expect(amountAfter).not.toBe(amount);
    expect(amountAfter?.answer).toBe('5');
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

    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });

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

    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });

    expect(after).toHaveBeenCalledTimes(1);
    expect(session.diagnostics).toEqual([{ code: 'listener-threw', severity: 'warning', path: null, related: [], detail: null }]);
  });

  it('stops notifying after unsubscribe', () => {
    const session = createSession(SLICE);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    unsubscribe();
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('refused commands are no-op cycles with a reason', () => {
  it.each([
    ['a disabled node (INV-S-14)', { type: 'SetAnswer', path: AMOUNT, value: '5' }, 'node-disabled'],
    ['an unknown path', { type: 'ClearAnswer', path: itemPath('nope') }, 'unknown-path'],
    ['a value of the wrong type (INV-S-10)', { type: 'SetAnswer', path: SMOKER, value: 'yes' }, 'type-mismatch'],
    ['leaving a disabled node', { type: 'NoteItemLeft', path: AMOUNT }, 'node-disabled'],
  ] as const)('refuses %s', (_, command, reason) => {
    const session = createSession(SLICE);
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();

    expect(session.dispatch(command)).toEqual({ outcome: 'refused', reason });

    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
  });

  it('refuses an empty string, which FHIR cannot carry, instead of storing it', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    expect(session.dispatch({ type: 'SetAnswer', path: AMOUNT, value: '' })).toEqual({ outcome: 'refused', reason: 'empty-value' });
  });
});

describe('enablement and retention', () => {
  it('retains a hidden answer out of sight and shows it again (INV-S-12)', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, value: '5' });

    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: false });
    expect(session.getSnapshot().change).toMatchObject({ disabled: [AMOUNT], responseChanged: true });
    expect(visiblePaths(session)).toEqual([SMOKER]);

    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    expect(session.getSnapshot().nodes[1]?.answer).toBe('5');
  });

  it('never lets a retained answer satisfy a condition (INV-S-04)', () => {
    const session = createSession({
      items: [
        ...SLICE.items,
        { linkId: 'heavy', type: 'boolean', text: 'C', enableWhen: [{ question: 'amount', operator: '=', answer: '20' }] },
      ],
    });
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, value: '20' });
    expect(visiblePaths(session)).toHaveLength(3);

    session.dispatch({ type: 'ClearAnswer', path: SMOKER });

    expect(visiblePaths(session)).toEqual([SMOKER]);
    expect(session.getSnapshot().change?.disabled).toEqual([AMOUNT, itemPath('heavy')]);
  });

  it('combines conditions under enableBehavior any (INV-S-02)', () => {
    const session = createSession({
      items: [
        { linkId: 'a', type: 'boolean', text: 'A' },
        { linkId: 'b', type: 'boolean', text: 'B' },
        {
          linkId: 'c',
          type: 'string',
          text: 'C',
          enableBehavior: 'any',
          enableWhen: [
            { question: 'a', operator: '=', answer: true },
            { question: 'b', operator: '=', answer: true },
          ],
        },
      ],
    });
    session.dispatch({ type: 'SetAnswer', path: itemPath('b'), value: true });
    expect(visiblePaths(session)).toContain(itemPath('c'));
  });
});

describe('surfacing: quiet, then live, never back (SM-03)', () => {
  const answeredSmoker = () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    return session;
  };
  const amount = (session: ReturnType<typeof createSession>) => session.getSnapshot().nodes[1];

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
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, value: '5' });
    expect(amount(session)).toMatchObject({ issues: [], surfaced: true });

    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: false });
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    session.dispatch({ type: 'ClearAnswer', path: AMOUNT });

    expect(amount(session)).toMatchObject({ issues: [{ code: 'required' }], surfaced: true });
  });

  it('does not surface anything when the item left has no issue', () => {
    const session = answeredSmoker();
    session.dispatch({ type: 'SetAnswer', path: AMOUNT, value: '5' });
    expect(session.dispatch({ type: 'NoteItemLeft', path: AMOUNT })).toEqual({ outcome: 'unchanged' });
    expect(amount(session)?.surfaced).toBe(false);
  });
});

describe('completion (SM-01)', () => {
  it('refuses with errors, surfaces every issue and notifies each time', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: true });
    const listener = vi.fn<(change: SessionChange) => void>();
    session.subscribe(listener);

    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'refused', reason: 'validation-errors' });
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'refused', reason: 'validation-errors' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ completion: 'refused', surfaced: [AMOUNT] });
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ completion: 'refused', surfaced: [] });
    expect(session.getSnapshot()).toMatchObject({ status: 'in-progress', completionRefused: true, cycle: 3 });
  });

  it('ignores a disabled required item (INV-V-01) and then refuses every command (INV-S-31)', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: SMOKER, value: false });

    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot()).toMatchObject({ status: 'completed', change: { completion: 'completed' } });

    for (const command of [
      { type: 'SetAnswer', path: SMOKER, value: true },
      { type: 'RequestCompletion' },
    ] as const) {
      expect(session.dispatch(command)).toEqual({ outcome: 'refused', reason: 'session-completed' });
    }
  });
});
