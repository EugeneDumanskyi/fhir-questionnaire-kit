import { describe, expect, it } from 'vitest';

import { isAnswer, isCoding } from '../../src/kernel/answer.js';

describe('answers are checked, not trusted (04-domain.md §7.1)', () => {
  it.each([
    { kind: 'boolean', value: false },
    { kind: 'decimal', value: 0.5 },
    { kind: 'decimal', value: -3 },
    { kind: 'integer', value: 2_147_483_647 },
    { kind: 'integer', value: -2_147_483_648 },
    { kind: 'date', value: '2024-05' },
    { kind: 'dateTime', value: '2024-05-01T10:00:00Z' },
    { kind: 'string', value: ' ' },
    { kind: 'coding', value: { system: 'http://loinc.org', code: 'LA33-6' } },
    { kind: 'coding', value: { display: 'Other' } },
    { kind: 'quantity', value: { value: 72.5, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' } },
    { kind: 'quantity', value: { value: 0 } },
  ])('accepts $kind $value', (answer) => {
    expect(isAnswer(answer)).toBe(true);
  });

  it.each([
    null,
    'yes',
    [],
    { kind: 'boolean', value: 'true' },
    { kind: 'decimal', value: Number.NaN },
    { kind: 'decimal', value: Number.POSITIVE_INFINITY },
    { kind: 'integer', value: 1.5 },
    { kind: 'integer', value: 2_147_483_648 },
    { kind: 'integer', value: '1' },
    { kind: 'date', value: '2024-02-30' },
    { kind: 'date', value: 20240101 },
    { kind: 'dateTime', value: '2024-05-01T10:00:00' },
    { kind: 'string', value: '' },
    { kind: 'string', value: 1 },
    { kind: 'coding', value: { system: 'http://loinc.org' } },
    { kind: 'coding', value: { code: '' } },
    { kind: 'coding', value: 'LA33-6' },
    { kind: 'quantity', value: { unit: 'kg' } },
    { kind: 'quantity', value: { value: 1, unit: '' } },
    { kind: 'quantity', value: null },
    { kind: 'time', value: '10:00:00' },
    { kind: 'toString', value: 'x' },
    { kind: 1, value: 1 },
    { value: true },
  ])('refuses %j', (candidate) => {
    expect(isAnswer(candidate)).toBe(false);
  });

  it('checks a coding on its own, for options and conditions', () => {
    expect(isCoding({ code: 'a', system: 'urn:x' })).toBe(true);
    expect(isCoding({ code: 'a', system: 7 })).toBe(false);
    expect(isCoding(undefined)).toBe(false);
  });
});
