import type { Answer, Quantity } from '../index.js';
import { sameAnswer } from '../kernel/answer.js';
import { parseDate, parseDateTime } from '../kernel/temporal.js';
import { offsetIn } from './format.js';

/**
 * Text as typed, and the answers it makes (INV-P-06, M5 plan D3 and D4).
 * The entry form is FHIR's own, with no locale parsing (NFR-I-04): `2024`,
 * `2024-05`, `2024-05-01`, and for a `dateTime` `2024-05-01T14:30`, read in
 * the host's `timeZone`, or with its offset written. Text that is not a value
 * yet makes no answer: it stays on screen, and the view raises its issue.
 */

export type EntryType = 'string' | 'text' | 'integer' | 'decimal' | 'date' | 'dateTime' | 'quantity';

/** What a quantity's value is sent with: the chosen unit's fields. */
export type Unit = Omit<Quantity, 'value'>;

const INT32 = 2_147_483_647;
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;

const two = (value: number): string => String(value).padStart(2, '0');

/** One entry's answer, or `null` when the text is not a value of the type. `''` is never passed. */
export function parseEntry(type: EntryType, text: string, timeZone: string | undefined, unit: Unit): Answer | null {
  switch (type) {
    case 'integer': {
      const value = Number(text);
      return /^[+-]?\d+$/.test(text) && value >= -INT32 - 1 && value <= INT32 ? { kind: 'integer', value } : null;
    }
    case 'decimal':
    case 'quantity': {
      if (!DECIMAL.test(text)) return null;
      const value = Number(text);
      return type === 'decimal' ? { kind: 'decimal', value } : { kind: 'quantity', value: { value, ...unit } };
    }
    case 'date':
      return parseDate(text) === null ? null : { kind: 'date', value: text };
    case 'dateTime':
      return parseDateTime(text) !== null ? { kind: 'dateTime', value: text } : wallClock(text, timeZone);
    default:
      return { kind: 'string', value: text };
  }
}

/**
 * `2024-05-01T14:30` is a wall clock: FHIR needs its seconds and offset. The
 * offset is the one written, else the host zone's at that time, else there is
 * none to take and the text is not yet a value: UTC is never assumed.
 */
function wallClock(text: string, timeZone: string | undefined): Answer | null {
  const match = WALL_CLOCK.exec(text);
  const [, date = '', hour = '', minute = '', second = '00', written] = match ?? [];
  const day = parseDate(date);
  if (match === null || day === null || (written === undefined && timeZone === undefined)) return null;
  let offset = written;
  if (offset === undefined) {
    const minutes = offsetIn(timeZone ?? '', day.year, day.month, day.day, Number(hour), Number(minute), Number(second));
    offset = `${minutes < 0 ? '-' : '+'}${two(Math.trunc(Math.abs(minutes) / 60))}:${two(Math.abs(minutes) % 60)}`;
  }
  const value = `${date}T${hour}:${minute}:${second}${offset}`;
  return parseDateTime(value) === null ? null : { kind: 'dateTime', value };
}

/** An answer written back in the entry form: what the field shows when nothing is being typed. */
export function entryText(answer: Answer): string {
  switch (answer.kind) {
    case 'quantity':
      return String(answer.value.value);
    case 'coding':
      return answer.value.code ?? '';
    default:
      return String(answer.value);
  }
}

/**
 * The entries a node shows and the answers they make. A draft is kept while
 * the answers it makes are the node's answers; once they differ, something
 * else changed the answers (a restore, another view, a calculation) and the
 * answers win.
 */
export function entries(
  type: EntryType,
  answers: readonly Answer[],
  draft: readonly string[] | undefined,
  timeZone: string | undefined,
  unit: Unit,
): { readonly texts: readonly string[]; readonly answers: readonly Answer[]; readonly invalid: boolean } {
  if (draft !== undefined) {
    const made = fromTexts(type, draft, timeZone, unit);
    if (made.answers.length === answers.length && made.answers.every((answer, index) => sameAnswer(answer, answers[index] as Answer))) {
      return { texts: draft, ...made };
    }
  }
  return { texts: answers.map(entryText), answers, invalid: false };
}

/** The answers typed text makes, in order, and whether any text made none. */
export function fromTexts(type: EntryType, texts: readonly string[], timeZone: string | undefined, unit: Unit): { answers: Answer[]; invalid: boolean } {
  const answers: Answer[] = [];
  let invalid = false;
  for (const text of texts) {
    if (text === '') continue;
    const answer = parseEntry(type, text, timeZone, unit);
    if (answer === null) invalid = true;
    else answers.push(answer);
  }
  return { answers, invalid };
}
