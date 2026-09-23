import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import { fill, formatAnswer, formatDateTime, formatList, formatNumber, offsetIn, plural, scaleOf } from '../../src/view/format.js';
import { setup } from './helpers.js';

/** Runs `act` with the process in another zone. Node re-reads `TZ` when it is assigned. */
const ORIGINAL_TZ = process.env['TZ'];
const inZone = <T>(zone: string, act: () => T): T => {
  process.env['TZ'] = zone;
  return act();
};
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

describe('formatting from an explicit locale (ADR-0020, NFR-I-04)', () => {
  it('formats a date as the same day on both sides of the date line (ADR-0020 verification)', () => {
    for (const zone of ['Pacific/Kiritimati', 'Etc/GMT+12', 'UTC']) {
      expect(inZone(zone, () => formatDateTime('2024-05-01', 'en-GB', undefined)), zone).toBe('1 May 2024');
      expect(inZone(zone, () => formatDateTime('2024-05-01', 'en-GB', 'Pacific/Kiritimati')), zone).toBe('1 May 2024');
    }
  });

  it('formats a date at its authored precision: a year, a month, a day', () => {
    expect(formatDateTime('2024', 'en-GB', undefined)).toBe('2024');
    expect(formatDateTime('2024-05', 'en-GB', undefined)).toBe('May 2024');
    expect(formatDateTime('2024-05-01', 'en-US', undefined)).toBe('May 1, 2024');
    expect(formatDateTime('2024-05-01', 'de', undefined)).toBe('1. Mai 2024');
    expect(formatDateTime('0045-03-15', 'en-GB', undefined)).toBe('15 March 45');
  });

  it('formats a dateTime with a time in the host zone, else at its own offset, never in the environment’s', () => {
    const value = '2024-05-01T23:30:00+02:00';
    expect(inZone('Pacific/Kiritimati', () => formatDateTime(value, 'en-GB', undefined))).toBe('1 May 2024, 23:30');
    expect(inZone('Etc/GMT+12', () => formatDateTime(value, 'en-GB', undefined))).toBe('1 May 2024, 23:30');
    expect(formatDateTime(value, 'en-GB', 'UTC')).toBe('1 May 2024, 21:30');
    expect(formatDateTime(value, 'en-GB', 'Asia/Tokyo')).toBe('2 May 2024, 06:30');
    expect(formatDateTime('2024-05-01', 'en-GB', 'Asia/Tokyo')).toBe('1 May 2024');
    expect(formatDateTime('not a date', 'en-GB', undefined)).toBe('not a date');
  });

  it('is a pure function of its inputs: the environment’s zone never changes the output (property)', () => {
    const zones = ['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12', 'America/St_Johns', 'Asia/Kathmandu'];
    const dates = fc
      .record({ year: fc.integer({ min: 1, max: 9999 }), month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }), hour: fc.integer({ min: 0, max: 23 }), precision: fc.constantFrom(0, 1, 2, 3) })
      .map(({ year, month, day, hour, precision }) => {
        const pad = (n: number, size = 2) => String(n).padStart(size, '0');
        return [`${pad(year, 4)}`, `${pad(year, 4)}-${pad(month)}`, `${pad(year, 4)}-${pad(month)}-${pad(day)}`, `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:15:00-03:30`][precision] ?? '';
      });
    fc.assert(
      fc.property(dates, fc.constantFrom(...zones), fc.constantFrom('en', 'en-GB', 'fr'), fc.constantFrom(undefined, 'Europe/Berlin'), (value, zone, locale, timeZone) => {
        const reference = inZone('UTC', () => formatDateTime(value, locale, timeZone));
        expect(inZone(zone, () => formatDateTime(value, locale, timeZone))).toBe(reference);
      }),
    );
  });

  it('keeps a decimal’s scale from the text it was typed as, and never rounds (ADR-0020, M5 plan D7)', () => {
    expect(formatNumber(0.5, 'en', scaleOf('0.50'))).toBe('0.50');
    expect(formatNumber(0.5, 'en', scaleOf('0.5'))).toBe('0.5');
    expect(formatNumber(1234.5, 'de', 1)).toBe('1.234,5');
    expect(formatNumber(0.1234567, 'en')).toBe('0.1234567');
    expect(scaleOf('12')).toBe(0);
  });

  it('formats every answer kind for reading, a quantity with its unit text verbatim', () => {
    expect(formatAnswer({ kind: 'integer', value: 1200 }, 'en', undefined)).toBe('1,200');
    expect(formatAnswer({ kind: 'decimal', value: 0.25 }, 'en', undefined)).toBe('0.25');
    expect(formatAnswer({ kind: 'decimal', value: 0.5 }, 'en', undefined, 2)).toBe('0.50');
    expect(formatAnswer({ kind: 'date', value: '2024-05' }, 'en-GB', undefined)).toBe('May 2024');
    expect(formatAnswer({ kind: 'dateTime', value: '2024-05-01T10:00:00Z' }, 'en-GB', undefined)).toBe('1 May 2024, 10:00');
    expect(formatAnswer({ kind: 'quantity', value: { value: 72.5, unit: 'kg' } }, 'en', undefined)).toBe('72.5 kg');
    expect(formatAnswer({ kind: 'quantity', value: { value: 72.5, code: 'kg' } }, 'en', undefined)).toBe('72.5 kg');
    expect(formatAnswer({ kind: 'quantity', value: { value: 3 } }, 'en', undefined)).toBe('3');
    expect(formatAnswer({ kind: 'quantity', value: { value: 0.5, unit: 'mg' } }, 'en', undefined, 2)).toBe('0.50 mg');
    expect(formatAnswer({ kind: 'coding', value: { code: 'a', display: 'Apple' } }, 'en', undefined)).toBe('Apple');
    expect(formatAnswer({ kind: 'coding', value: { code: 'a' } }, 'en', undefined)).toBe('a');
    expect(formatAnswer({ kind: 'coding', value: { system: 'urn:x' } }, 'en', undefined)).toBe('');
    expect(formatAnswer({ kind: 'string', value: 'text' }, 'en', undefined)).toBe('text');
  });

  it('formats counts and lists through Intl, and fills placeholders literally', () => {
    expect(plural({ one: '{count} item', other: '{count} items' }, 1200, 'en')).toBe('1,200 items');
    expect(plural({ one: '{count} item for {who}', other: '{count} items' }, 1, 'en', { who: 'you' })).toBe('1 item for you');
    expect(formatList(['A', 'B', 'C'], 'en')).toBe('A, B, and C');
    expect(formatList([], 'en')).toBe('');
    expect(fill('{message}: {label}', { message: 'M', label: "$& $1 costs $'" })).toBe("M: $& $1 costs $'");
    expect(fill('{unknown}', {})).toBe('{unknown}');
  });

  it('takes a zone’s offset for a wall clock from Intl, across a change of offset', () => {
    expect(offsetIn('Europe/Berlin', 2024, 1, 15, 12, 0, 0)).toBe(60);
    expect(offsetIn('Europe/Berlin', 2024, 7, 15, 12, 0, 0)).toBe(120);
    expect(offsetIn('America/St_Johns', 2024, 1, 15, 12, 0, 0)).toBe(-210);
    expect(offsetIn('Asia/Kathmandu', 2024, 1, 15, 12, 0, 0)).toBe(345);
    // 02:30 on 31 March 2024 does not exist in Berlin: read at +01:00, it is 03:30 CEST, after the gap.
    expect(offsetIn('Europe/Berlin', 2024, 3, 31, 2, 30, 0)).toBe(60);
    // 02:30 on 27 October 2024 happens twice; the first, at +02:00, is taken.
    expect(offsetIn('Europe/Berlin', 2024, 10, 27, 2, 30, 0)).toBe(120);
    expect(offsetIn('UTC', 1969, 12, 31, 23, 59, 59)).toBe(0);
  });

  it('formats the view’s values in the host’s locale and nothing else', () => {
    const { at } = setup([{ linkId: 'd', type: 'date', text: 'D' }, { linkId: 'n', type: 'decimal', text: 'N' }], { locale: 'de' });
    at('d', 'calendar-date').set('2024-05-01');
    at('n', 'decimal').set('1234.50');
    expect(at('d', 'calendar-date').display).toBe('1. Mai 2024');
    expect(at('n', 'decimal').display).toBe('1.234,50');
  });
});
