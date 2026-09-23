import { describe, expect, it } from 'vitest';

import type { Questionnaire } from '../../src/index.js';
import { hydrateSession } from '../../src/resume.js';
import { createView } from '../../src/view/index.js';
import { EXT, find, setup } from './helpers.js';

type Item = NonNullable<Questionnaire['item']>[number];

const occurs = (min: number | null, max: number | null) => [
  ...(min === null ? [] : [{ url: `${EXT}questionnaire-minOccurs`, valueInteger: min }]),
  ...(max === null ? [] : [{ url: `${EXT}questionnaire-maxOccurs`, valueInteger: max }]),
];

const meds = (extra: Partial<Item> = {}): Item => ({
  linkId: 'meds',
  type: 'group',
  text: 'Medicine',
  repeats: true,
  item: [
    { linkId: 'name', type: 'string', text: 'Name' },
    { linkId: 'dose', type: 'integer', text: 'Dose' },
  ],
  ...extra,
});

describe('repeating groups (INV-P-04, AC-03.2.1, AC-03.2.4, AC-11.2.1)', () => {
  it('names each instance by the group and its position, and ids it by its path', () => {
    const { at } = setup([meds()]);
    at('meds', 'repeating-group').add();
    const group = at('meds', 'repeating-group');
    expect(group.instances.map(({ path, number, label, removeLabel, ids }) => ({ path, number, label, removeLabel, remove: ids.control }))).toEqual([
      { path: 'meds[0]', number: 1, label: 'Medicine 1', removeLabel: 'Remove Medicine 1', remove: 'fq-meds_5b_0_5d_-control' },
      { path: 'meds[1]', number: 2, label: 'Medicine 2', removeLabel: 'Remove Medicine 2', remove: 'fq-meds_5b_1_5d_-control' },
    ]);
    expect(group).toMatchObject({ canAdd: true, reason: null, addLabel: 'Add Medicine' });
    expect(group.instances[1]?.children.map((node) => node.path)).toEqual(['meds[1]/name', 'meds[1]/dose']);
  });

  it('moves focus to a new instance’s first control (AC-03.2.1)', () => {
    const { at, model } = setup([meds()]);
    at('meds', 'repeating-group').add();
    expect(model().focusTarget).toEqual({ id: 'fq-meds_5b_1_5d__2f_name-control', cycle: 1 });
    expect(model().announcement?.text).toBe('1 section added.');
  });

  it('makes the add control inert at maxOccurs and says why (INV-P-04)', () => {
    const { session, at } = setup([meds({ extension: occurs(null, 2) })]);
    at('meds', 'repeating-group').add();
    expect(at('meds', 'repeating-group')).toMatchObject({ canAdd: false, reason: 'You can add up to 2.' });
    const before = session.getSnapshot();
    at('meds', 'repeating-group').add();
    expect(session.getSnapshot()).toBe(before);
    const one = setup([meds({ extension: occurs(null, 1) })]);
    expect(one.at('meds', 'repeating-group')).toMatchObject({ canAdd: false, reason: 'You can add only 1.' });
  });

  it('after a removal focuses the instance that took its place, else the one before, else the add control (M5 plan D12)', () => {
    const { at, model } = setup([meds()]);
    at('meds', 'repeating-group').add();
    at('meds', 'repeating-group').add();
    const [first, , third] = at('meds', 'repeating-group').instances;
    first?.remove();
    expect(model().focusTarget?.id).toBe('fq-meds_5b_1_5d__2f_name-control');
    expect(model().announcement?.text).toBe('1 section removed.');
    third?.remove();
    expect(model().focusTarget?.id).toBe('fq-meds_5b_1_5d__2f_name-control');
    at('meds', 'repeating-group').instances[0]?.remove();
    expect(at('meds', 'repeating-group').instances).toEqual([]);
    expect(model().focusTarget?.id).toBe('fq-meds-control');
  });

  it('focuses an instance’s remove control when it holds nothing to answer', () => {
    const { at, model } = setup([{ linkId: 'notes', type: 'group', text: 'Notes', repeats: true, item: [{ linkId: 'n', type: 'display', text: 'A note' }] }]);
    at('notes', 'repeating-group').add();
    expect(model().focusTarget?.id).toBe('fq-notes_5b_1_5d_-control');
  });

  it('finds the first control through nested groups and repeats', () => {
    const { at, model } = setup([
      {
        linkId: 'visits',
        type: 'group',
        text: 'Visit',
        repeats: true,
        item: [
          { linkId: 'intro', type: 'display', text: 'Intro' },
          { linkId: 'box', type: 'group', text: 'Box', item: [{ linkId: 'note', type: 'display', text: 'Note' }] },
          { linkId: 'box2', type: 'group', text: 'Box 2', item: [{ linkId: 'why', type: 'string', text: 'Why' }] },
        ],
      },
      { linkId: 'outer', type: 'group', text: 'Outer', repeats: true, item: [{ linkId: 'inner', type: 'group', text: 'Inner', repeats: true, item: [{ linkId: 'x', type: 'boolean', text: 'X' }] }] },
    ]);
    at('visits', 'repeating-group').add();
    expect(model().focusTarget?.id).toBe('fq-visits_5b_1_5d__2f_box2_2f_why-control');
    at('outer', 'repeating-group').add();
    expect(model().focusTarget?.id).toBe('fq-outer_5b_1_5d__2f_inner_5b_0_5d__2f_x-control');
    at('outer[1]/inner', 'repeating-group').instances[0]?.remove();
    at('outer', 'repeating-group').instances[1]?.remove();
    at('outer', 'repeating-group').add();
    expect(model().focusTarget?.id).toBe('fq-outer_5b_2_5d__2f_inner_5b_0_5d__2f_x-control');
  });

  it('keeps the summary link of a group issue on the add control while it can add, else on the label (M5 plan D12)', () => {
    const { session, at, model } = setup([meds({ extension: occurs(3, 3) })]);
    session.dispatch({ type: 'RequestCompletion' });
    expect(model().errorSummary?.entries).toEqual([
      { path: 'meds', message: 'Medicine: Give at least 3. There are 1.', focusId: 'fq-meds-control' },
    ]);
    expect(at('meds', 'repeating-group').issues).toEqual([{ rule: 'min-occurs', message: 'Give at least 3. There are 1.' }]);
    at('meds', 'repeating-group').add();
    at('meds', 'repeating-group').add();
    expect(model().errorSummary).toBeNull();
  });

  it('holds more instances than maxOccurs from stored data: add inert, the issue linked to the label, removal still works (T9)', () => {
    const questionnaire = { resourceType: 'Questionnaire' as const, status: 'draft' as const, item: [meds({ extension: occurs(null, 1) })] };
    const stored = {
      resourceType: 'QuestionnaireResponse' as const,
      status: 'in-progress' as const,
      item: [0, 1].map((n) => ({ linkId: 'meds', item: [{ linkId: 'name', answer: [{ valueString: `m${n}` }] }] })),
    };
    const session = hydrateSession(questionnaire, stored);
    const view = createView(session, { idPrefix: 'fq', locale: 'en' });
    session.dispatch({ type: 'RequestCompletion' });
    const group = find(view.getSnapshot(), 'meds', 'repeating-group');
    expect(group).toMatchObject({ canAdd: false, reason: 'You can add only 1.', issues: [{ rule: 'max-occurs', message: 'Give no more than 1. There are 2.' }] });
    expect(view.getSnapshot().errorSummary?.entries).toEqual([{ path: 'meds', message: 'Medicine: Give no more than 1. There are 2.', focusId: 'fq-meds-label' }]);
    group.instances[0]?.remove();
    expect(find(view.getSnapshot(), 'meds', 'repeating-group').instances).toHaveLength(1);
    expect(view.getSnapshot().errorSummary).toBeNull();
  });
});
