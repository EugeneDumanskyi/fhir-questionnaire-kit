import { describe, expect, it, vi } from 'vitest';

import { createSession, itemPath, type CommandResult, type Session, type SessionChange } from '../../src/index.js';
import { recomputeTrace } from '../../src/session/trace.js';
import { bool, questionnaire, text } from '../slice.js';

/**
 * M2 AC-3 and AC-8's cycle half: a cascade settles in the cycle that caused
 * it, with exactly one notification, and a command issued while a cycle runs
 * gets a cycle of its own, in order (ADR-0009 "single writer", INV-S-05,
 * INV-S-33).
 */

const eq = (question: string) => [{ question, operator: '=', answerBoolean: true }] as const;
const paths = (session: Session) => session.getSnapshot().nodes.map((node) => node.path);

/** A → B → C → D, each enabled by the previous answering yes. */
const CHAIN = questionnaire([
  { linkId: 'a', type: 'boolean' },
  { linkId: 'b', type: 'boolean', enableWhen: eq('a') },
  { linkId: 'c', type: 'boolean', enableWhen: eq('b') },
  { linkId: 'd', type: 'string', enableWhen: eq('c') },
]);

const opened = (retention: 'retain-exclude' | 'discard' = 'retain-exclude') => {
  const session = createSession(CHAIN, { retention });
  for (const path of ['a', 'b', 'c']) session.dispatch({ type: 'SetAnswer', path: itemPath(path), answers: bool(true) });
  session.dispatch({ type: 'SetAnswer', path: itemPath('d'), answers: text('x') });
  return session;
};

describe('chain collapse (AC-02.2.1, M2 AC-3)', () => {
  it.each(['retain-exclude', 'discard'] as const)('disables a three-deep chain in one cycle with one notification (%s)', (retention) => {
    const session = opened(retention);
    const seen: SessionChange[] = [];
    const snapshots: string[][] = [];
    session.subscribe((change) => {
      seen.push(change);
      snapshots.push(paths(session));
    });
    const cycle = session.getSnapshot().cycle;

    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(false) })).toEqual({ outcome: 'applied' });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ disabled: ['b', 'c', 'd'], enabled: [], responseChanged: true });
    expect(snapshots).toEqual([['a']]);
    expect(session.getSnapshot().cycle).toBe(cycle + 1);
    expect(recomputeTrace(session)).toEqual(['b', 'c', 'd']);
  });

  it('restores the chain in one cycle under retain-exclude, answers included', () => {
    const session = opened();
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(false) });
    const listener = vi.fn();
    session.subscribe(listener);

    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().change?.enabled).toEqual(['b', 'c', 'd']);
    expect(session.getSnapshot().nodes.at(-1)?.answers).toEqual(text('x'));
  });

  it('restores only the first link under discard, since the rest lost their answers', () => {
    const session = opened('discard');
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(false) });
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });
    expect(paths(session)).toEqual(['a', 'b']);
  });

  it('stops propagating where nothing changes (ADR-0009 step 3)', () => {
    const session = opened();
    session.dispatch({ type: 'SetAnswer', path: itemPath('d'), answers: text('y') });
    expect(recomputeTrace(session)).toEqual([]);
    session.dispatch({ type: 'ClearAnswer', path: itemPath('c') });
    expect(recomputeTrace(session)).toEqual(['d']);
  });
});

describe('re-entrancy: one writer, one cycle per command, in order (ADR-0009)', () => {
  it('runs two commands a subscriber issues after its own cycle, each with its own notification', () => {
    const session = createSession(CHAIN);
    const order: string[] = [];
    const results: CommandResult[] = [];
    session.subscribe((change) => {
      order.push(`${change.command}:${change.enabled.join(',')}`);
      if (change.enabled.includes(itemPath('b'))) {
        results.push(session.dispatch({ type: 'SetAnswer', path: itemPath('b'), answers: bool(true) }));
        results.push(session.dispatch({ type: 'SetAnswer', path: itemPath('c'), answers: bool(true) }));
        // The outer cycle is still the one observed: nothing ran yet.
        expect(paths(session)).toEqual(['a', 'b']);
      }
    });

    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });

    expect(results).toEqual([{ outcome: 'deferred' }, { outcome: 'deferred' }]);
    expect(order).toEqual(['SetAnswer:b', 'SetAnswer:c', 'SetAnswer:d']);
    expect(paths(session)).toEqual(['a', 'b', 'c', 'd']);
    expect(session.getSnapshot().cycle).toBe(3);
  });

  it('never lets a subscriber observe a cycle in progress (INV-S-05)', () => {
    const session = opened();
    const observed: number[] = [];
    session.subscribe(() => observed.push(session.getSnapshot().nodes.length));
    session.subscribe(() => observed.push(session.getSnapshot().nodes.length));
    session.dispatch({ type: 'SetAnswer', path: itemPath('b'), answers: bool(false) });
    expect(observed).toEqual([2, 2]);
  });

  it('notifies the subscribers present when the cycle started, even if one unsubscribes another', () => {
    const session = createSession(CHAIN);
    const second = vi.fn();
    let unsubscribeSecond = () => {};
    session.subscribe(() => unsubscribeSecond());
    unsubscribeSecond = session.subscribe(second);

    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(false) });

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('runs a command a subscriber queued before throwing; the throw is a diagnostic, and the session stays usable', () => {
    const session = createSession(CHAIN);
    session.subscribe(() => {
      session.dispatch({ type: 'SetAnswer', path: itemPath('b'), answers: bool(true) });
      throw new Error('host bug after queueing');
    });
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });
    expect(paths(session)).toEqual(['a', 'b', 'c']);
    expect(session.diagnostics.map((finding) => finding.code)).toEqual(['listener-threw', 'listener-threw']);
    expect(session.dispatch({ type: 'ClearAnswer', path: itemPath('a') })).toEqual({ outcome: 'applied' });
  });
});
