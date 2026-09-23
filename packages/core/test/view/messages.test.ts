import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createSession, itemPath, type Questionnaire, type SessionOptions } from '../../src/index.js';
import { createView, type ViewOptions } from '../../src/view/index.js';
import { SLICE } from '../slice.js';
import { EXT, find, setup } from './helpers.js';

describe('the message catalogue (US-07.4, INV-X-08, ADR-0020)', () => {
  const refuse = (overrides: ViewOptions['messages'], options?: SessionOptions) => {
    const session = createSession(SLICE, options);
    const view = createView(session, { idPrefix: 'fq', locale: 'en', ...(overrides === undefined ? {} : { messages: overrides }) });
    view.getSnapshot();
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
    session.dispatch({ type: 'RequestCompletion' });
    return view.getSnapshot();
  };

  it('uses a supplied key and falls back to the built-in text for the rest, key by key', () => {
    const model = refuse({ yes: 'Ja', errorSummaryHeading: 'Es gibt ein Problem', announceRefused: { one: 'Nicht fertig: {count}.', other: 'Nicht fertig: {count}.' } });
    expect(find(model, 'smoker', 'yes-no').options.map((option) => option.label)).toEqual(['Ja', 'No']);
    expect(model.errorSummary?.heading).toBe('Es gibt ein Problem');
    expect(model.announcement?.text).toBe('Nicht fertig: 1.');
    expect(find(model, 'amount', 'short-text').issues[0]?.message).toBe('Answer this question');
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['not a string', 42],
    ['a plural message where a string belongs', { one: 'x', other: 'y' }],
  ])('falls back when a supplied string is %s, never to an empty or raw-key string', (_, given) => {
    const model = refuse({ yes: given, issueRequired: given } as unknown as ViewOptions['messages']);
    expect(find(model, 'smoker', 'yes-no').options[0]?.label).toBe('Yes');
    expect(find(model, 'amount', 'short-text').issues[0]?.message).toBe('Answer this question');
  });

  it('falls back when a plural message is missing a form', () => {
    const model = refuse({ announceRefused: { one: 'only one' } } as unknown as ViewOptions['messages']);
    expect(model.announcement?.text).toBe('The form was not completed. 1 answer needs attention.');
  });

  it('never reads an inherited name as a key', () => {
    const model = refuse(Object.create({ yes: 'inherited' }) as ViewOptions['messages']);
    expect(find(model, 'smoker', 'yes-no').options[0]?.label).toBe('Yes');
  });

  it("gives a rule's issue the host's text for its key, else the generic message, never the key (M4 AC-7)", () => {
    const rules = { rules: [{ inputs: ['smoker'], targets: ['amount'], check: () => 'smoker-amount' }] };
    const messages = (model: ReturnType<typeof refuse>) => find(model, 'amount', 'short-text').issues.map((issue) => issue.message);
    expect(messages(refuse({ 'smoker-amount': 'Say how much you smoke' }, rules))).toEqual(['Answer this question', 'Say how much you smoke']);
    const fallback = messages(refuse(undefined, rules));
    expect(fallback).toEqual(['Answer this question', 'Check this answer']);
    expect(fallback).not.toContain('smoker-amount');
  });

  it('lets a host word a built-in rule by its code, and fills the same values in', () => {
    const { at, session } = setup([{ linkId: 'n', type: 'string', text: 'N', maxLength: 2 }], { messages: { 'max-length': 'Höchstens {limit}, nicht {value}' } });
    at('n', 'short-text').set('abcd');
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('n') });
    expect(at('n', 'short-text').issues[0]?.message).toBe('Höchstens 2, nicht 4');
  });

  it('holds at most 45 keys, each with its context documented (NFR-I-02)', async () => {
    const { en } = await import('../../src/view/messages/en.js');
    const source = readFileSync(new URL('../../src/view/messages/en.ts', import.meta.url), 'utf8');
    expect(Object.keys(en).length).toBeLessThanOrEqual(45);
    for (const key of Object.keys(en)) expect(source, key).toMatch(new RegExp(`\\*/\\n  ${key}:`));
  });
});

describe('issue text names the limit and the value entered (AC-04.2.1, M3 plan D1)', () => {
  type Item = NonNullable<Questionnaire['item']>[number];
  type Kind = 'short-text' | 'integer' | 'decimal' | 'calendar-date';
  const limits = (min: object, max: object) => [
    { url: `${EXT}minValue`, ...min },
    { url: `${EXT}maxValue`, ...max },
  ];
  const cases: readonly [string, Item, Kind, string, string][] = [
    ['max-length', { linkId: 'q', type: 'string', text: 'Q', maxLength: 3 }, 'short-text', 'abcdé', 'Use 3 characters or fewer. You used 5.'],
    ['min-value', { linkId: 'q', type: 'integer', text: 'Q', extension: limits({ valueInteger: 1000 }, { valueInteger: 5000 }) }, 'integer', '12', 'Enter 1,000 or more. You entered 12.'],
    ['max-value', { linkId: 'q', type: 'decimal', text: 'Q', extension: limits({ valueDecimal: 0 }, { valueDecimal: 2.5 }) }, 'decimal', '3.50', 'Enter 2.5 or less. You entered 3.50.'],
    ['max-value on a date', { linkId: 'q', type: 'date', text: 'Q', extension: limits({ valueDate: '2000-01-01' }, { valueDate: '2024-05-01' }) }, 'calendar-date', '2024-06-01', 'Enter May 1, 2024 or less. You entered June 1, 2024.'],
    ['max-decimal-places', { linkId: 'q', type: 'decimal', text: 'Q', extension: [{ url: `${EXT}maxDecimalPlaces`, valueInteger: 1 }] }, 'decimal', '1.25', 'Decimal places allowed: 1. You entered 1.25.'],
    ['min-occurs', { linkId: 'q', type: 'string', text: 'Q', repeats: true, extension: [{ url: `${EXT}questionnaire-minOccurs`, valueInteger: 2 }] }, 'short-text', 'one', 'Give at least 2. There are 1.'],
  ];

  it.each(cases)('%s', (_, item, kind, typed, message) => {
    const { at, model } = setup([item]);
    const node = find(model(), 'q', kind);
    node.set(typed);
    node.leave();
    expect(at('q', node.control).issues.map((issue) => issue.message)).toContain(message);
  });

  it('keeps the value in the field while the issue shows (AC-04.2.1)', () => {
    const { at } = setup([{ linkId: 'q', type: 'string', text: 'Q', maxLength: 1 }]);
    at('q', 'short-text').set('too long');
    at('q', 'short-text').leave();
    expect(at('q', 'short-text')).toMatchObject({ entry: 'too long', value: 'too long', invalid: true });
  });
});
