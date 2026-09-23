import { describe, expect, it } from 'vitest';

import { itemPath } from '../../src/index.js';
import { emitted, hint, options, setup } from './helpers.js';


describe('options and their commands (AC-01.2.2, AC-01.2.3)', () => {
  it('selects one option by key on a single choice, and shows it', () => {
    const { session, at } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerOption: options(3) }]);
    at('c', 'single-choice').set('1');
    expect(at('c', 'single-choice')).toMatchObject({
      value: { kind: 'coding', value: { system: 'urn:test', code: 'o2', display: 'Option 2' } },
      display: 'Option 2',
      other: null,
      optionState: 'ready',
      optionMessage: null,
    });
    expect(at('c', 'single-choice').options.map((option) => option.selected)).toEqual([false, true, false]);
    expect(emitted(session, 'c')).toEqual([{ valueCoding: { system: 'urn:test', code: 'o2', display: 'Option 2' } }]);
    at('c', 'single-choice').set('no such key');
    expect(at('c', 'single-choice').value).toBeNull();
  });

  it('selects, toggles and deselects on a multiple choice', () => {
    const { at } = setup([{ linkId: 'c', type: 'choice', text: 'C', repeats: true, answerOption: options(3), extension: [hint('check-box')] }]);
    at('c', 'multi-choice').set(['0', '2']);
    expect(at('c', 'multi-choice').display).toBe('Option 1 and Option 3');
    at('c', 'multi-choice').toggle('1');
    expect(at('c', 'multi-choice').options.map((option) => option.selected)).toEqual([true, true, true]);
    at('c', 'multi-choice').toggle('0');
    expect(at('c', 'multi-choice').value.map((answer) => (answer.kind === 'coding' ? answer.value.code : null))).toEqual(['o2', 'o3']);
    at('c', 'multi-choice').set([]);
    expect(at('c', 'multi-choice').value).toEqual([]);
  });

  it('takes free text on an open choice, which replaces a selected option and is replaced by one (T10)', () => {
    const { session, at } = setup([{ linkId: 'oc', type: 'open-choice', text: 'OC', answerOption: options(2) }]);
    expect(at('oc', 'single-choice').other).toBe('');
    at('oc', 'single-choice').set('0');
    at('oc', 'single-choice').setOther('Something else');
    expect(at('oc', 'single-choice')).toMatchObject({ other: 'Something else', value: null, display: 'Something else' });
    expect(emitted(session, 'oc')).toEqual([{ valueString: 'Something else' }]);
    at('oc', 'single-choice').set('1');
    expect(at('oc', 'single-choice')).toMatchObject({ other: '', display: 'Option 2' });
    expect(emitted(session, 'oc')).toEqual([{ valueCoding: { system: 'urn:test', code: 'o2', display: 'Option 2' } }]);
    at('oc', 'single-choice').setOther('x');
    at('oc', 'single-choice').setOther('');
    expect(emitted(session, 'oc')).toEqual([]);
  });

  it('keeps free text beside the options picked on a repeating open choice', () => {
    const { session, at } = setup([{ linkId: 'oc', type: 'open-choice', text: 'OC', repeats: true, answerOption: options(2) }]);
    at('oc', 'multi-choice').toggle('1');
    at('oc', 'multi-choice').setOther('Other thing');
    at('oc', 'multi-choice').toggle('0');
    expect(emitted(session, 'oc')).toEqual([
      { valueCoding: { system: 'urn:test', code: 'o1', display: 'Option 1' } },
      { valueCoding: { system: 'urn:test', code: 'o2', display: 'Option 2' } },
      { valueString: 'Other thing' },
    ]);
    at('oc', 'multi-choice').set(['1']);
    expect(at('oc', 'multi-choice')).toMatchObject({ other: 'Other thing', display: 'Option 2 and Other thing' });
  });

  it('labels options of other kinds through Intl', () => {
    const { at } = setup([
      { linkId: 'n', type: 'choice', text: 'N', answerOption: [{ valueInteger: 1000 }, { valueDate: '2024-05' }, { valueString: 'plain' }] },
    ]);
    expect(at('n', 'single-choice').options.map((option) => option.label)).toEqual(['1,000', 'May 2024', 'plain']);
  });

  it('keeps an answer no option matches as a selected option of its own, so the screen never hides it (T8)', () => {
    const { session, at } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerOption: options(2) }]);
    session.dispatch({ type: 'SetAnswer', path: itemPath('c'), answers: [{ kind: 'coding', value: { system: 'urn:test', code: 'gone', display: 'Retired option' } }] });
    expect(at('c', 'single-choice').options).toEqual([
      { key: '0', label: 'Option 1', selected: false },
      { key: '1', label: 'Option 2', selected: false },
      { key: '2', label: 'Retired option', selected: true },
    ]);
    at('c', 'single-choice').set('2');
    expect(at('c', 'single-choice').display).toBe('Retired option');
  });

  it('matches a coding with no code by its display', () => {
    const { session, at } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerOption: [{ valueCoding: { display: 'Only text' } }] }]);
    session.dispatch({ type: 'SetAnswer', path: itemPath('c'), answers: [{ kind: 'coding', value: { display: 'Only text' } }] });
    expect(at('c', 'single-choice').options).toEqual([{ key: '0', label: 'Only text', selected: true }]);
  });

  it('reports a value set’s state and retries a failed one (SM-04, AC-07.1.2)', async () => {
    let calls = 0;
    const { at, model } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerValueSet: 'urn:vs' }], {}, {
      resolver: () => (++calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve([{ code: 'a', display: 'A' }])),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(at('c', 'single-choice')).toMatchObject({ optionState: 'failed', optionMessage: 'The choices could not be loaded', options: [] });
    expect(model().labels.retry).toBe('Try again');
    at('c', 'single-choice').retry();
    expect(at('c', 'single-choice').optionState).toBe('pending');
    await Promise.resolve();
    await Promise.resolve();
    expect(at('c', 'single-choice')).toMatchObject({ optionState: 'ready', options: [{ key: '0', label: 'A', selected: false }] });
    at('c', 'single-choice').retry();
    expect(calls).toBe(2);
  });

  it('says the options are unavailable without a resolver, and a retry does nothing', () => {
    const { session, at } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerValueSet: 'urn:vs' }]);
    expect(at('c', 'single-choice')).toMatchObject({ optionState: 'unavailable', optionMessage: 'The choices are not available' });
    const before = session.getSnapshot();
    at('c', 'single-choice').retry();
    expect(session.getSnapshot()).toBe(before);
  });

  it('never retries inline options', () => {
    const { session, at } = setup([{ linkId: 'c', type: 'choice', text: 'C', answerOption: options(1) }]);
    const before = session.getSnapshot();
    at('c', 'single-choice').retry();
    expect(session.getSnapshot()).toBe(before);
  });

  it('answers and clears a yes/no question by key', () => {
    const { at } = setup([{ linkId: 'b', type: 'boolean', text: 'B' }]);
    at('b', 'yes-no').set('false');
    expect(at('b', 'yes-no')).toMatchObject({ value: false, display: 'No' });
    at('b', 'yes-no').set('true');
    expect(at('b', 'yes-no')).toMatchObject({ value: true, display: 'Yes', options: [{ selected: true }, { selected: false }] });
    at('b', 'yes-no').clear();
    expect(at('b', 'yes-no')).toMatchObject({ value: null, display: '' });
  });
});
