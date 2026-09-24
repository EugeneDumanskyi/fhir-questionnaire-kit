import { describe, expect, it } from 'vitest';

import type { ControlKind, ControlProps, ControlView } from '../../src/view/index.js';
import { options, setup } from './helpers.js';

/** What a renderer hands a host's control (ADR-0013 tier 3), built from the node as `@fhirq/react` builds it. */
const props = <K extends ControlKind>(node: ControlView<K>, set: ControlProps<K>['set']): ControlProps<K> => ({ node, ids: node.ids, set, clear: () => undefined, leave: node.leave });

describe('ControlProps: the tier-3 contract, typed by kind (ADR-0013 amendment notes)', () => {
  it("gives each kind its own node's set: text for entries, a key for single options, keys for multiple", () => {
    const { at, session } = setup([
      { linkId: 'born', type: 'date', text: 'Born' },
      { linkId: 'smoker', type: 'boolean', text: 'Smoker' },
      { linkId: 'colour', type: 'choice', text: 'Colour', answerOption: options(2) },
      { linkId: 'pets', type: 'choice', text: 'Pets', repeats: true, answerOption: options(2) },
    ]);
    const born = at('born', 'calendar-date');
    const smoker = at('smoker', 'yes-no');
    const colour = at('colour', 'single-choice');
    const pets = at('pets', 'multi-choice');

    props(born, born.set).set('2024-05');
    props(smoker, smoker.set).set('true');
    props(colour, colour.set).set(colour.options[0]?.key ?? '');
    props(pets, pets.set).set(pets.options.map((option) => option.key));

    // Checked by the compiler, never run.
    const wrong = () => {
      // @ts-expect-error a multiple choice takes keys, not one key
      props(pets, pets.set).set('a');
      // @ts-expect-error a single choice takes one key
      props(colour, colour.set).set(['a']);
      // @ts-expect-error a read-only kind has nothing to set
      const nothing: ControlProps<'statement'>['set'] = () => undefined;
      return nothing;
    };
    expect(typeof wrong).toBe('function');

    const answered = session.getSnapshot().nodes.map((node) => [node.path, node.answers.length]);
    expect(answered).toEqual([
      ['born', 1],
      ['smoker', 1],
      ['colour', 1],
      ['pets', 2],
    ]);
  });
});
