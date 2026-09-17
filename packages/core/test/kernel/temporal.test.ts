import { describe, expect, it } from 'vitest';

import { parseDate, parseDateTime } from '../../src/kernel/temporal.js';

describe('FHIR date', () => {
  it.each([
    ['2024', { precision: 'year', year: 2024, month: 0, day: 0 }],
    ['2024-05', { precision: 'month', year: 2024, month: 5, day: 0 }],
    ['2024-05-31', { precision: 'day', year: 2024, month: 5, day: 31 }],
    ['2024-02-29', { precision: 'day', year: 2024, month: 2, day: 29 }],
    ['2000-02-29', { precision: 'day', year: 2000, month: 2, day: 29 }],
    ['0001', { precision: 'year', year: 1, month: 0, day: 0 }],
  ])('keeps the precision of %s', (text, expected) => {
    expect(parseDate(text)).toEqual(expected);
  });

  it.each(['', '0000', '24', '2024-5', '2024-13', '2024-00', '2024-04-31', '2023-02-29', '1900-02-29', '2024-05-01T10:00:00Z', ' 2024'])(
    'rejects %j',
    (text) => {
      expect(parseDate(text)).toBeNull();
    },
  );
});

describe('FHIR dateTime', () => {
  it('keeps a partial dateTime partial, with no offset', () => {
    expect(parseDateTime('2024-05')).toEqual({
      precision: 'month', year: 2024, month: 5, day: 0, hour: 0, minute: 0, second: 0, fraction: '', offsetMinutes: null,
    });
  });

  it('reads a full dateTime with its offset and fraction as written', () => {
    expect(parseDateTime('2024-05-01T23:59:60.1200+05:30')).toEqual({
      precision: 'time', year: 2024, month: 5, day: 1, hour: 23, minute: 59, second: 60, fraction: '12', offsetMinutes: 330,
    });
  });

  it.each([
    ['2024-05-01T10:00:00Z', 0],
    ['2024-05-01T10:00:00-03:00', -180],
    ['2024-05-01T10:00:00+14:00', 840],
    ['2024-05-01T10:00:00-00:00', 0],
  ])('reads the offset of %s', (text, minutes) => {
    expect(parseDateTime(text)?.offsetMinutes).toBe(minutes);
  });

  it.each(['2024-05-01T10:00:00', '2024-05-01T10:00Z', '2024-05-01T24:00:00Z', '2024-05-01T10:00:00+15:00', '2024-02-30T10:00:00Z', '2024-05-01 10:00:00Z'])(
    'rejects %j',
    (text) => {
      expect(parseDateTime(text)).toBeNull();
    },
  );
});
