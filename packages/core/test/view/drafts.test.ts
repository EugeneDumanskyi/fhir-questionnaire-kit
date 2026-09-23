import { describe, expect, it } from 'vitest';

import { createSession, itemPath } from '../../src/index.js';
import { createView } from '../../src/view/index.js';
import { entries, entryText, parseEntry } from '../../src/view/drafts.js';
import { questionnaire } from '../slice.js';
import { emitted, EXT, setup } from './helpers.js';


describe('drafts: text that is not a value yet (INV-P-06, M5 plan D3)', () => {
  it('keeps an invalid date on screen, clears the answer, and says "not a date" once the item is left', () => {
    const { session, at, model } = setup([{ linkId: 'd', type: 'date', text: 'Date of birth' }]);
    at('d', 'calendar-date').set('2024-05-01');
    expect(emitted(session, 'd')).toEqual([{ valueDate: '2024-05-01' }]);

    at('d', 'calendar-date').set('2024-13');
    expect(at('d', 'calendar-date')).toMatchObject({ entry: '2024-13', value: null, display: '', invalid: false, issues: [] });
    // The old answer never sits in the response behind text the screen no longer shows.
    expect(emitted(session, 'd')).toEqual([]);

    at('d', 'calendar-date').leave();
    expect(at('d', 'calendar-date')).toMatchObject({ invalid: true, issues: [{ rule: 'not-a-date', message: 'Enter a real date, like 2024-05-01, 2024-05 or 2024' }] });
    expect(model().announcement?.text).toBe('1 answer needs attention.');

    // Live from now on: the issue goes as soon as the text is a date, and comes back when it is not.
    at('d', 'calendar-date').set('2024-12');
    expect(at('d', 'calendar-date')).toMatchObject({ invalid: false, value: '2024-12', display: 'December 2024' });
    at('d', 'calendar-date').set('2024-12-3');
    expect(at('d', 'calendar-date').issues.map((issue) => issue.rule)).toEqual(['not-a-date']);
  });

  it('never lets an invalid draft reach the engine: a required item stays unanswered (INV-P-06)', () => {
    const { session, at } = setup([{ linkId: 'n', type: 'integer', text: 'Count', required: true }]);
    at('n', 'integer').set('1.5');
    expect(session.getSnapshot().nodes[0]?.answers).toEqual([]);
    session.dispatch({ type: 'RequestCompletion' });
    expect(at('n', 'integer').issues.map((issue) => issue.rule)).toEqual(['required', 'not-a-number']);
  });

  it('shows a draft’s issue after a refused completion, left or not, and lists it in the summary', () => {
    const { session, at, model } = setup([
      { linkId: 'd', type: 'dateTime', text: 'When' },
      { linkId: 'r', type: 'string', text: 'Reason', required: true },
    ]);
    at('d', 'date-time').set('yesterday');
    expect(at('d', 'date-time').invalid).toBe(false);
    session.dispatch({ type: 'RequestCompletion' });
    expect(at('d', 'date-time').issues.map((issue) => issue.rule)).toEqual(['not-a-date']);
    expect(model().errorSummary?.entries.map((entry) => entry.path)).toEqual(['d', 'r']);
  });

  it('does not block a completion: a draft on an optional item is not an answer, and the response omits it', () => {
    const { session, at, model } = setup([{ linkId: 'd', type: 'dateTime', text: 'When' }]);
    at('d', 'date-time').set('yesterday');
    session.dispatch({ type: 'RequestCompletion' });
    expect(model().completed).toBe(true);
    expect(emitted(session, 'd')).toEqual([]);
  });

  it('drops a draft once something else changes the answers: the answers win', () => {
    const { session, at } = setup([{ linkId: 'd', type: 'decimal', text: 'Dose' }]);
    at('d', 'decimal').set('0.50');
    expect(at('d', 'decimal')).toMatchObject({ entry: '0.50', value: 0.5, display: '0.50' });
    session.dispatch({ type: 'SetAnswer', path: itemPath('d'), answers: [{ kind: 'decimal', value: 2 }] });
    expect(at('d', 'decimal')).toMatchObject({ entry: '2', value: 2, display: '2' });
  });

  it('keeps a decimal’s typed scale while the draft lasts; a new view shows the number’s own (M5 plan D7)', () => {
    const { session, at } = setup([{ linkId: 'd', type: 'decimal', text: 'Dose' }]);
    at('d', 'decimal').set('0.50');
    expect(at('d', 'decimal').display).toBe('0.50');
    const fresh = createView(session, { idPrefix: 'x', locale: 'en' }).getSnapshot().nodes[0];
    expect(fresh).toMatchObject({ entry: '0.5', display: '0.5' });
  });

  it('clears the draft and the answer together', () => {
    const { session, at } = setup([{ linkId: 'd', type: 'date', text: 'D' }]);
    at('d', 'calendar-date').set('20');
    at('d', 'calendar-date').leave();
    at('d', 'calendar-date').clear();
    expect(at('d', 'calendar-date')).toMatchObject({ entry: '', invalid: false });
    expect(emitted(session, 'd')).toEqual([]);
    at('d', 'calendar-date').set('');
    expect(at('d', 'calendar-date').entry).toBe('');
  });

  it('reads a dateTime’s wall clock in the host zone, keeps a written offset, and assumes no zone (M5 plan D4)', () => {
    const zoned = setup([{ linkId: 't', type: 'dateTime', text: 'T' }], { timeZone: 'Europe/Berlin', locale: 'en-GB' });
    zoned.at('t', 'date-time').set('2024-07-01T09:15');
    expect(zoned.at('t', 'date-time')).toMatchObject({ value: '2024-07-01T09:15:00+02:00', entry: '2024-07-01T09:15', display: '1 Jul 2024, 09:15' });
    expect(emitted(zoned.session, 't')).toEqual([{ valueDateTime: '2024-07-01T09:15:00+02:00' }]);

    const bare = setup([{ linkId: 't', type: 'dateTime', text: 'T' }], { locale: 'en-GB' });
    bare.at('t', 'date-time').set('2024-07-01T09:15');
    bare.at('t', 'date-time').leave();
    expect(bare.at('t', 'date-time')).toMatchObject({ value: null, issues: [{ rule: 'not-a-date' }] });
    bare.at('t', 'date-time').set('2024-07-01T09:15-05:00');
    expect(bare.at('t', 'date-time')).toMatchObject({ value: '2024-07-01T09:15:00-05:00', display: '1 Jul 2024, 09:15', invalid: false });
    bare.at('t', 'date-time').set('2024-07');
    expect(bare.at('t', 'date-time')).toMatchObject({ value: '2024-07', display: 'July 2024' });
  });

  it('parses each entry type as FHIR writes it, and nothing else', () => {
    const none = {};
    expect(parseEntry('integer', '-2147483648', undefined, none)).toEqual({ kind: 'integer', value: -2147483648 });
    expect(parseEntry('integer', '2147483648', undefined, none)).toBeNull();
    expect(parseEntry('integer', '+7', undefined, none)).toEqual({ kind: 'integer', value: 7 });
    expect(parseEntry('integer', '1e3', undefined, none)).toBeNull();
    expect(parseEntry('decimal', '.5', undefined, none)).toEqual({ kind: 'decimal', value: 0.5 });
    expect(parseEntry('decimal', '1,5', undefined, none)).toBeNull();
    expect(parseEntry('quantity', '3', undefined, { unit: 'mg' })).toEqual({ kind: 'quantity', value: { value: 3, unit: 'mg' } });
    expect(parseEntry('date', '2023-02-29', undefined, none)).toBeNull();
    expect(parseEntry('dateTime', '2024-02-30T10:00', 'UTC', none)).toBeNull();
    expect(parseEntry('dateTime', '2024-02-10T25:00', 'UTC', none)).toBeNull();
    expect(parseEntry('dateTime', '2024-02-10T10:00:30Z', undefined, none)).toEqual({ kind: 'dateTime', value: '2024-02-10T10:00:30Z' });
    expect(parseEntry('dateTime', '2024-02-10T10:00Z', undefined, none)).toEqual({ kind: 'dateTime', value: '2024-02-10T10:00:00Z' });
    expect(parseEntry('dateTime', '2024-02-10T10:00', 'Asia/Kathmandu', none)).toEqual({ kind: 'dateTime', value: '2024-02-10T10:00:00+05:45' });
    expect(parseEntry('dateTime', '2024-02-10T10:00', 'America/St_Johns', none)).toEqual({ kind: 'dateTime', value: '2024-02-10T10:00:00-03:30' });
    expect(parseEntry('text', ' ', undefined, none)).toEqual({ kind: 'string', value: ' ' });
    expect(entryText({ kind: 'coding', value: { code: 'a' } })).toBe('a');
    expect(entryText({ kind: 'coding', value: { display: 'A' } })).toBe('');
    expect(entryText({ kind: 'quantity', value: { value: 2.5 } })).toBe('2.5');
    expect(entries('string', [{ kind: 'string', value: 'b' }], ['a'], undefined, none).texts).toEqual(['b']);
  });
});

describe('repeating questions (AC-03.3.1)', () => {
  const item = { linkId: 'names', type: 'string' as const, text: 'Names', repeats: true };

  it('offers one entry per answer and an empty one to add the next', () => {
    const { session, at } = setup([item]);
    expect(at('names', 'short-text').entries).toEqual(['']);
    at('names', 'short-text').setAt(0, 'Ann');
    at('names', 'short-text').setAt(1, 'Bo');
    expect(at('names', 'short-text')).toMatchObject({ entries: ['Ann', 'Bo', ''], entry: 'Ann', value: 'Ann', display: 'Ann and Bo' });
    expect(emitted(session, 'names')).toEqual([{ valueString: 'Ann' }, { valueString: 'Bo' }]);
    at('names', 'short-text').setAt(0, '');
    expect(at('names', 'short-text').entries).toEqual(['', 'Bo', '']);
    expect(emitted(session, 'names')).toEqual([{ valueString: 'Bo' }]);
    at('names', 'short-text').setAt(1, '');
    expect(at('names', 'short-text').entries).toEqual(['']);
  });

  it('offers no further entry at maxOccurs', () => {
    const { at } = setup([{ ...item, extension: [{ url: `${EXT}questionnaire-maxOccurs`, valueInteger: 2 }] }]);
    at('names', 'short-text').setAt(0, 'Ann');
    at('names', 'short-text').setAt(1, 'Bo');
    expect(at('names', 'short-text').entries).toEqual(['Ann', 'Bo']);
  });

  it('keeps an invalid entry among valid ones, which alone reach the engine', () => {
    const { session, at } = setup([{ linkId: 'dates', type: 'date', text: 'Dates', repeats: true }]);
    at('dates', 'calendar-date').setAt(0, '2024');
    at('dates', 'calendar-date').setAt(1, '2024-1');
    at('dates', 'calendar-date').setAt(2, '2025');
    expect(at('dates', 'calendar-date').entries).toEqual(['2024', '2024-1', '2025', '']);
    expect(emitted(session, 'dates')).toEqual([{ valueDate: '2024' }, { valueDate: '2025' }]);
  });

  it('ignores a command on a node that is no longer visible', () => {
    const session = createSession(questionnaire([{ linkId: 'a', type: 'boolean', text: 'A' }, { linkId: 'b', type: 'string', text: 'B', enableWhen: [{ question: 'a', operator: '=', answerBoolean: true }] }]));
    const view = createView(session, { idPrefix: 'fq', locale: 'en' });
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: [{ kind: 'boolean', value: true }] });
    const b = view.getSnapshot().nodes[1];
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: [{ kind: 'boolean', value: false }] });
    if (b?.control !== 'short-text') throw new Error('b is not shown');
    const before = session.getSnapshot();
    b.set('x');
    b.setAt(1, 'y');
    expect(session.getSnapshot()).toBe(before);
  });
});

describe('quantities (AC-01.2.4, M5 plan D6)', () => {
  const units = [
    { url: `${EXT}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code: 'kg', display: 'kilograms' } },
    { url: `${EXT}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code: '[lb_av]', display: 'pounds' } },
  ];

  it('emits value, unit, system and code from a permitted unit, chosen before or after the value', () => {
    const { session, at } = setup([{ linkId: 'w', type: 'quantity', text: 'Weight', extension: units }]);
    at('w', 'quantity').setUnit('1');
    expect(at('w', 'quantity').units.map((unit) => unit.selected)).toEqual([false, true]);
    expect(emitted(session, 'w')).toEqual([]);
    at('w', 'quantity').set('150.0');
    expect(emitted(session, 'w')).toEqual([{ valueQuantity: { value: 150, unit: 'pounds', system: 'http://unitsofmeasure.org', code: '[lb_av]' } }]);
    expect(at('w', 'quantity')).toMatchObject({ display: '150.0 pounds', entry: '150.0' });

    at('w', 'quantity').setUnit('0');
    expect(emitted(session, 'w')).toEqual([{ valueQuantity: { value: 150, unit: 'kilograms', system: 'http://unitsofmeasure.org', code: 'kg' } }]);
    expect(at('w', 'quantity').units.map((unit) => unit.selected)).toEqual([true, false]);
  });

  it('fails validation with a value and no unit, and names it (AC-01.2.4)', () => {
    const { at } = setup([{ linkId: 'w', type: 'quantity', text: 'Weight', extension: units }]);
    at('w', 'quantity').set('70');
    at('w', 'quantity').leave();
    expect(at('w', 'quantity').issues).toEqual([{ rule: 'unit-missing', message: 'Choose a unit' }]);
    at('w', 'quantity').setUnit('9');
    expect(at('w', 'quantity').issues.map((issue) => issue.rule)).toEqual(['unit-missing']);
  });

  it('takes a typed unit when the questionnaire permits none', () => {
    const { session, at } = setup([{ linkId: 'w', type: 'quantity', text: 'Weight' }]);
    at('w', 'quantity').setUnit('stone');
    at('w', 'quantity').set('11');
    expect(at('w', 'quantity')).toMatchObject({ units: [], unit: 'stone', display: '11 stone' });
    expect(emitted(session, 'w')).toEqual([{ valueQuantity: { value: 11, unit: 'stone' } }]);
    at('w', 'quantity').setUnit('');
    expect(emitted(session, 'w')).toEqual([{ valueQuantity: { value: 11 } }]);
  });
});
