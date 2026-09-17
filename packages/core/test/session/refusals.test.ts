import { describe, expect, it, vi } from 'vitest';

import { createSession, itemPath, type Command, type ItemPath, type Session } from '../../src/index.js';
import { bool, questionnaire, text } from '../slice.js';

/**
 * ADR-0002 and M2 AC-8: a hidden answer can be restored, never edited while
 * hidden. Every answer and repeat command is refused against a disabled node,
 * a node under a disabled group and a node inside a disabled repeating
 * group's instance, as a no-op cycle with a reason: no state change, no
 * notification, and never a throw.
 */

const eq = (question: string) => [{ question, operator: '=', answerBoolean: true }] as const;
const at = (path: string) => path as ItemPath;

const FORM = questionnaire([
  { linkId: 'open', type: 'boolean' },
  { linkId: 'note', type: 'string', enableWhen: eq('open') },
  { linkId: 'section', type: 'group', enableWhen: eq('open'), item: [{ linkId: 'inner', type: 'string' }] },
  {
    linkId: 'meds',
    type: 'group',
    repeats: true,
    enableWhen: eq('open'),
    item: [
      { linkId: 'name', type: 'string' },
      { linkId: 'doses', type: 'group', repeats: true, item: [{ linkId: 'amount', type: 'string' }] },
    ],
  },
]);

/** Everything answered while open, then closed so every target is hidden with a retained answer. */
function closed(): Session {
  const session = createSession(FORM);
  const set = (path: string, value: string) => session.dispatch({ type: 'SetAnswer', path: at(path), answers: text(value) });
  session.dispatch({ type: 'SetAnswer', path: itemPath('open'), answers: bool(true) });
  set('note', 'n');
  set('section/inner', 'i');
  set('meds[0]/name', 'm');
  set('meds[0]/doses[0]/amount', '5');
  session.dispatch({ type: 'SetAnswer', path: itemPath('open'), answers: bool(false) });
  return session;
}

const TARGETS = [
  ['a disabled node', 'note'],
  ['a node under a disabled group', 'section/inner'],
  ['a node in an instance of a disabled repeating group', 'meds[0]/name'],
  ['a node two repeats down in a disabled group', 'meds[0]/doses[0]/amount'],
] as const;

const GROUPS = [
  ['a disabled repeating group', 'meds'],
  ['a nested repeating group whose ancestor is disabled', 'meds[0]/doses'],
] as const;

describe('ADR-0002: commands against hidden nodes are refused (INV-S-14, AC-05.2.5)', () => {
  const refused = (session: Session, command: Command) => {
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();
    const result = session.dispatch(command);
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
    return result;
  };

  describe.each(TARGETS)('%s', (_, path) => {
    it.each([
      ['SetAnswer', { type: 'SetAnswer', path: at(path), answers: text('edited') }],
      ['ClearAnswer', { type: 'ClearAnswer', path: at(path) }],
      ['NoteItemLeft', { type: 'NoteItemLeft', path: at(path) }],
    ] as const)('refuses %s', (_, command) => {
      expect(refused(closed(), command)).toEqual({ outcome: 'refused', reason: 'node-disabled' });
    });
  });

  describe.each(GROUPS)('%s', (_, path) => {
    it.each([
      ['AddRepeatInstance', { type: 'AddRepeatInstance', path: at(path) }],
      ['RemoveRepeatInstance', { type: 'RemoveRepeatInstance', path: at(path), ordinal: 0 }],
    ] as const)('refuses %s', (_, command) => {
      expect(refused(closed(), command)).toEqual({ outcome: 'refused', reason: 'node-disabled' });
    });
  });

  it('shows every retained answer again, unchanged, once the gate reopens', () => {
    const session = closed();
    for (const [, path] of TARGETS) session.dispatch({ type: 'SetAnswer', path: at(path), answers: text('edited') });
    session.dispatch({ type: 'SetAnswer', path: itemPath('open'), answers: bool(true) });
    const answers = Object.fromEntries(session.getSnapshot().nodes.map((node) => [node.path, node.answers[0]?.value]));
    expect(answers).toMatchObject({ note: 'n', 'section/inner': 'i', 'meds[0]/name': 'm', 'meds[0]/doses[0]/amount': '5' });
  });
});
