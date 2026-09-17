/**
 * FHIR `date` and `dateTime` values, validated and taken apart without ever
 * passing through `Date` or UTC (repository convention: a `date` carries no
 * timezone, and partial precision is preserved). Comparison lives with the
 * conditions that need it; this module only says what a value *is*.
 *
 * The patterns are R4's own (`date` and `dateTime` datatype regexes), and a
 * value must also name a real calendar day.
 */

export type DatePrecision = 'year' | 'month' | 'day';

export interface PartialDate {
  readonly precision: DatePrecision;
  readonly year: number;
  /** 1–12; 0 when the precision is `year`. */
  readonly month: number;
  /** 1–31; 0 when the precision is coarser than `day`. */
  readonly day: number;
}

export interface PartialDateTime extends Omit<PartialDate, 'precision'> {
  /** `time` means a full time of day with its UTC offset, which R4 requires together. */
  readonly precision: DatePrecision | 'time';
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** The fractional-second digits as written, trailing zeros removed; `''` for none. */
  readonly fraction: string;
  /** Minutes east of UTC; `null` unless the precision is `time`. */
  readonly offsetMinutes: number | null;
}

const YEAR = '([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)';
const MONTH = '(0[1-9]|1[0-2])';
const DAY = '(0[1-9]|[1-2][0-9]|3[0-1])';
const TIME = '([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\\.([0-9]+))?';
const OFFSET = '(Z|(\\+|-)((0[0-9]|1[0-3]):([0-5][0-9])|14:00))';

const DATE_PATTERN = new RegExp(`^${YEAR}(-${MONTH}(-${DAY})?)?$`);
const DATE_TIME_PATTERN = new RegExp(`^${YEAR}(-${MONTH}(-${DAY}(T${TIME}${OFFSET})?)?)?$`);

export function parseDate(text: string): PartialDate | null {
  const match = DATE_PATTERN.exec(text);
  if (match === null) return null;
  return calendar(match[1], match[5], match[7]);
}

export function parseDateTime(text: string): PartialDateTime | null {
  const match = DATE_TIME_PATTERN.exec(text);
  if (match === null) return null;
  const date = calendar(match[1], match[5], match[7]);
  if (date === null) return null;
  const hour = match[9];
  if (hour === undefined) {
    return { ...date, hour: 0, minute: 0, second: 0, fraction: '', offsetMinutes: null };
  }
  return {
    ...date,
    precision: 'time',
    hour: Number(hour),
    minute: Number(match[10]),
    second: Number(match[11]),
    fraction: (match[13] ?? '').replace(/0+$/, ''),
    offsetMinutes: offset(match[14] ?? 'Z', match[15], match[17], match[18]),
  };
}

function calendar(year: string | undefined, month: string | undefined, day: string | undefined): PartialDate | null {
  const y = Number(year);
  if (month === undefined) return { precision: 'year', year: y, month: 0, day: 0 };
  const m = Number(month);
  if (day === undefined) return { precision: 'month', year: y, month: m, day: 0 };
  const d = Number(day);
  return d <= daysInMonth(y, m) ? { precision: 'day', year: y, month: m, day: d } : null;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function offset(zone: string, sign: string | undefined, hours: string | undefined, minutes: string | undefined): number {
  if (zone === 'Z') return 0;
  // `14:00` is matched as a whole by the pattern, so its hour and minute groups are empty.
  const magnitude = hours === undefined ? 14 * 60 : Number(hours) * 60 + Number(minutes);
  return sign === '-' && magnitude > 0 ? -magnitude : magnitude;
}
