import { describe, expect, it } from 'vitest';

import { EXT, flatten, options, setup } from './helpers.js';

/**
 * Extensions outside the bounded surface that are not expressions (those are
 * INV-D-15's) and not modifiers: they load without a finding in strict mode,
 * and the view is what it would be without them (02-requirements.md §17).
 */
describe('extensions the kit leaves unread (M10 AC-2)', () => {
  it('shows the authored text and ignores a translation extension, whatever the locale (NFR-I-06)', () => {
    const translation = { url: `${EXT}translation`, extension: [{ url: 'lang', valueCode: 'de' }, { url: 'content', valueString: 'Schmerz' }] };
    const { session, at } = setup([{ linkId: 'pain', type: 'string', text: 'Pain', _text: { extension: [translation] } }], { locale: 'de' });
    expect(session.diagnostics).toEqual([]);
    expect(at('pain', 'short-text').label).toBe('Pain');
  });

  it('ignores the SDC rendering extensions the kit does not read, and renders as if they were absent', () => {
    const style = { url: `${EXT}rendering-style`, valueString: 'color: red' };
    const orientation = { url: `${EXT}questionnaire-choiceOrientation`, valueCode: 'horizontal' };
    const slider = { url: `${EXT}questionnaire-sliderStepValue`, valueInteger: 5 };
    const { session, model } = setup([
      { linkId: 'c', type: 'choice', text: 'C', extension: [orientation], _text: { extension: [style] }, answerOption: options(3) },
      { linkId: 'n', type: 'integer', text: 'N', extension: [slider] },
    ]);
    expect(session.diagnostics).toEqual([]);
    expect(flatten(model().nodes).map((node) => [node.path, node.control, node.label])).toEqual([
      ['c', 'single-choice', 'C'],
      ['n', 'integer', 'N'],
    ]);
  });
});
