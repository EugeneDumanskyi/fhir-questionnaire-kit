import { describe, expect, it } from 'vitest';

import type { Questionnaire } from '../../src/index.js';
import { EXT, find, flatten, hint, options, setup } from './helpers.js';

type Item = NonNullable<Questionnaire['item']>[number];

describe('control choice (INV-P-05, AC-01.2.1, AC-01.2.2)', () => {
  it('gives every supported item type a semantic control kind', () => {
    const { model } = setup(
      [
        { linkId: 'note', type: 'display', text: 'Read this' },
        {
          linkId: 'g',
          type: 'group',
          text: 'Group',
          item: [
            { linkId: 'b', type: 'boolean', text: 'B' },
            { linkId: 's', type: 'string', text: 'S' },
            { linkId: 't', type: 'text', text: 'T' },
            { linkId: 'i', type: 'integer', text: 'I' },
            { linkId: 'd', type: 'decimal', text: 'D' },
            { linkId: 'date', type: 'date', text: 'Date' },
            { linkId: 'dt', type: 'dateTime', text: 'Date and time' },
            { linkId: 'q', type: 'quantity', text: 'Q' },
            { linkId: 'c', type: 'choice', text: 'C', answerOption: options(2) },
            { linkId: 'oc', type: 'open-choice', text: 'OC', answerOption: options(2) },
          ],
        },
        { linkId: 'r', type: 'group', text: 'R', repeats: true, item: [{ linkId: 'x', type: 'string', text: 'X' }] },
      ],
      {},
      { loadMode: 'strict' },
    );
    expect(Object.fromEntries(flatten(model().nodes).map((node) => [node.path, node.control]))).toEqual({
      note: 'statement',
      g: 'group',
      'g/b': 'yes-no',
      'g/s': 'short-text',
      'g/t': 'long-text',
      'g/i': 'integer',
      'g/d': 'decimal',
      'g/date': 'calendar-date',
      'g/dt': 'date-time',
      'g/q': 'quantity',
      'g/c': 'single-choice',
      'g/oc': 'single-choice',
      r: 'repeating-group',
      'r[0]/x': 'short-text',
    });
  });

  it('shows an unsupported item as a non-interactive placeholder in lenient mode (AC-01.3.2)', () => {
    const { at } = setup([{ linkId: 'file', type: 'attachment', text: 'Upload' }], {}, { loadMode: 'lenient' });
    const node = at('file', 'unsupported');
    expect(node).toMatchObject({ label: 'Upload', notice: 'This question cannot be shown here', invalid: false });
    expect('set' in node).toBe(false);
  });

  it('shows a calculated item read-only, with its value formatted or "Score unavailable" (M5 plan D13)', () => {
    const calculated = {
      linkId: 'total',
      type: 'integer' as const,
      text: 'Total',
      extension: [{ url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression', valueExpression: { language: 'text/fhirpath', expression: '1' } }],
    };
    const none = setup([calculated], {}, { loadMode: 'lenient' });
    expect(none.at('total', 'calculated')).toMatchObject({ value: null, display: 'Score unavailable' });
    expect('set' in none.at('total', 'calculated')).toBe(false);
    const some = setup([calculated], {}, { evaluator: { evaluate: () => ({ kind: 'integer', value: 1234 }) } });
    expect(some.at('total', 'calculated')).toMatchObject({ value: { kind: 'integer', value: 1234 }, display: '1,234' });
  });

  // The whole rule: hint × repeats × option count, for choice and open-choice.
  const HINTS = [null, 'radio-button', 'drop-down', 'check-box', 'slider', 'autocomplete'] as const;
  const expected = (control: string | null, repeats: boolean, count: number): string => {
    if (repeats) return control === 'check-box' || count <= 5 ? 'multi-choice' : 'multi-list';
    if (control === 'radio-button') return 'single-choice';
    if (control === 'drop-down') return 'single-menu';
    return count <= 5 ? 'single-choice' : 'single-list';
  };
  const cases = HINTS.flatMap((control) => [false, true].flatMap((repeats) => [0, 1, 5, 6, 12].flatMap((count) => (['choice', 'open-choice'] as const).map((type) => ({ control, repeats, count, type })))));

  it.each(cases)('$type, hint $control, repeats $repeats, $count options → the INV-P-05 kind', ({ control, repeats, count, type }) => {
    const item: Item = { linkId: 'c', type, text: 'C', repeats, ...(count > 0 ? { answerOption: options(count) } : {}), ...(control === null ? {} : { extension: [hint(control)] }) };
    const { model } = setup([item]);
    expect(flatten(model().nodes)[0]?.control).toBe(expected(control, repeats, count));
  });

  it('counts a value set’s options once they resolve, so the kind follows the options (SM-04)', async () => {
    const valueSet = 'urn:vs';
    let settle: (codings: readonly { code: string }[]) => void = () => undefined;
    const { at } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerValueSet: valueSet }], {}, {
      resolver: () => new Promise((resolve) => (settle = resolve)),
    });
    expect(at('c', 'single-choice')).toMatchObject({ optionState: 'pending', optionMessage: 'Loading the choices', options: [] });
    settle(Array.from({ length: 7 }, (_, i) => ({ code: `c${i}` })));
    await Promise.resolve();
    await Promise.resolve();
    expect(at('c', 'single-list')).toMatchObject({ optionState: 'ready', optionMessage: null });
    expect(at('c', 'single-list').options.map((option) => option.label)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  });

  it('reads a unit option list for a quantity, as `questionnaire-unitOption` authors it (AC-01.2.4)', () => {
    const { at } = setup([
      {
        linkId: 'w',
        type: 'quantity',
        text: 'Weight',
        extension: [
          { url: `${EXT}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code: 'kg', display: 'kg' } },
          { url: `${EXT}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code: '[lb_av]', display: 'lb' } },
        ],
      },
    ]);
    expect(at('w', 'quantity').units).toEqual([
      { key: '0', label: 'kg', selected: false },
      { key: '1', label: 'lb', selected: false },
    ]);
  });

  it('finds nodes by kind through the helper, and refuses a wrong kind', () => {
    const { model } = setup([{ linkId: 'b', type: 'boolean', text: 'B' }]);
    expect(find(model(), 'b', 'yes-no').control).toBe('yes-no');
    expect(() => find(model(), 'b', 'short-text')).toThrow('b is yes-no, not short-text');
  });
});
