import { describe, expect, it } from 'vitest';

import { itemPath } from '../../src/index.js';
import type { InstanceView, ViewModel, ViewNode } from '../../src/view/index.js';
import { flatten, instancesOf, setup } from './helpers.js';

/** Every node and instance of a model by path. */
const byPath = (model: ViewModel): Map<string, ViewNode | InstanceView> =>
  new Map<string, ViewNode | InstanceView>([...flatten(model.nodes), ...instancesOf(model.nodes)].map((entry) => [entry.path, entry]));

/**
 * The paths whose object is new, among those present both before and after.
 * A node is new when it or anything under it changed (M5 plan D1).
 */
function renewed(before: ViewModel, after: ViewModel): string[] {
  const old = byPath(before);
  const changed = [...byPath(after)].filter(([path, entry]) => old.has(path) && old.get(path) !== entry);
  return changed.map(([path]) => path).sort();
}

describe('view identity across cycles (AC-4, ADR-0007)', () => {
  it('renews exactly the changed nodes and their ancestors over a scripted sequence', async () => {
    let settle: (codings: readonly { code: string }[]) => void = () => undefined;
    const { session, view, at } = setup(
      [
        { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
        {
          linkId: 'habits',
          type: 'group',
          text: 'Habits',
          item: [
            { linkId: 'amount', type: 'integer', text: 'How many?', required: true, enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
            { linkId: 'since', type: 'date', text: 'Since' },
          ],
        },
        { linkId: 'meds', type: 'group', text: 'Medicine', repeats: true, item: [{ linkId: 'name', type: 'string', text: 'Name' }] },
        { linkId: 'route', type: 'choice', text: 'Route', answerValueSet: 'urn:routes' },
        { linkId: 'note', type: 'display', text: 'Thanks' },
      ],
      {},
      { resolver: () => new Promise((resolve) => (settle = resolve)) },
    );
    const step = (act: () => void): { before: ViewModel; after: ViewModel } => {
      const before = view.getSnapshot();
      act();
      return { before, after: view.getSnapshot() };
    };

    // Answering a root question renews it, and the group whose child it shows.
    let { before, after } = step(() => at('smoker', 'yes-no').set('true'));
    expect(renewed(before, after)).toEqual(['habits', 'smoker']);
    expect(after.nodes[2]).toBe(before.nodes[2]);

    // Typing into a nested entry renews it and its group only.
    ({ before, after } = step(() => at('habits/since', 'calendar-date').set('2020')));
    expect(renewed(before, after)).toEqual(['habits', 'habits/since']);

    // A draft that is not a value yet is a change too, and nothing else moves.
    ({ before, after } = step(() => at('habits/since', 'calendar-date').set('2020-1')));
    expect(renewed(before, after)).toEqual(['habits', 'habits/since']);

    // Leaving it shows the draft's issue: that node only.
    ({ before, after } = step(() => at('habits/since', 'calendar-date').leave()));
    expect(renewed(before, after)).toEqual(['habits', 'habits/since']);

    // Adding an instance renews the group; the existing instance keeps its object.
    ({ before, after } = step(() => at('meds', 'repeating-group').add()));
    expect(renewed(before, after)).toEqual(['meds']);
    const firstInstance = instancesOf(after.nodes)[0];
    expect(instancesOf(before.nodes)[0]).toBe(firstInstance);

    // Typing in the second instance renews it and the group, not the first instance.
    ({ before, after } = step(() => session.dispatch({ type: 'SetAnswer', path: itemPath('meds', 1, 'name'), answers: [{ kind: 'string', value: 'x' }] })));
    expect(renewed(before, after)).toEqual(['meds', 'meds[1]', 'meds[1]/name']);

    // Removing the first instance renews the second: its position changed, its path did not.
    ({ before, after } = step(() => firstInstance?.remove()));
    expect(renewed(before, after)).toEqual(['meds', 'meds[1]']);
    expect(byPath(after).get('meds[1]/name')).toBe(byPath(before).get('meds[1]/name'));

    // Options settling renew the choice bound to them only (T12).
    ({ before, after } = step(() => undefined));
    settle([{ code: 'oral' }]);
    await Promise.resolve();
    await Promise.resolve();
    after = view.getSnapshot();
    expect(renewed(before, after)).toEqual(['route']);

    // A refused completion renews the nodes whose issues surfaced; the rest keep theirs.
    at('habits/since', 'calendar-date').set('2020');
    ({ before, after } = step(() => session.dispatch({ type: 'RequestCompletion' })));
    expect(renewed(before, after)).toEqual(['habits', 'habits/amount']);

    // Hiding a branch drops its node; nothing else moves but its ancestor and the answered question.
    ({ before, after } = step(() => at('smoker', 'yes-no').set('false')));
    expect(renewed(before, after)).toEqual(['habits', 'smoker']);
    expect(byPath(after).has('habits/amount')).toBe(false);
  });

  it('returns the same model, and the same node array, until something changes', () => {
    const { session, view, at } = setup([{ linkId: 'a', type: 'boolean', text: 'A' }, { linkId: 'b', type: 'string', text: 'B', required: true }]);
    const first = view.getSnapshot();
    expect(view.getSnapshot()).toBe(first);
    at('a', 'yes-no').leave();
    expect(view.getSnapshot()).toBe(first);
    session.dispatch({ type: 'RequestCompletion' });
    session.dispatch({ type: 'RequestCompletion' });
    const refused = view.getSnapshot();
    expect(refused).not.toBe(first);
    expect(refused.nodes[0]).toBe(first.nodes[0]);
    expect(refused.labels).toBe(first.labels);
  });

  it('binds each command once per path, so a renewed node carries the same functions', () => {
    const { view, at } = setup([{ linkId: 'a', type: 'string', text: 'A' }]);
    const before = at('a', 'short-text');
    before.set('x');
    const after = at('a', 'short-text');
    expect(after).not.toBe(before);
    expect([after.set, after.setAt, after.clear, after.leave]).toEqual([before.set, before.setAt, before.clear, before.leave]);
    expect(view.getSnapshot().nodes[0]).toBe(after);
  });
});
