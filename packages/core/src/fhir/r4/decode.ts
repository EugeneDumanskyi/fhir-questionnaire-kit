import { isAnswer, type AnswerKind } from '../../kernel/answer.js';
import { diagnostic, type Diagnostic } from '../../kernel/diagnostic.js';
import type { StoredAnswer, StoredItem, StoredResponse } from '../../kernel/response.js';

/**
 * R4 `QuestionnaireResponse` JSON in, version-neutral `StoredResponse` out
 * (ADR-0016), for hydration. What makes the input *not a response* rejects it
 * (`response-rejected`): the wrong resource, a modifier extension, a malformed
 * item tree. What is wrong with an answer's *content* never does
 * (INV-E-08): a value of a kind the kit does not hold, or a malformed one, is
 * decoded with `answer: null` and quarantined by hydration.
 */
export type DecodeResult =
  | { readonly ok: true; readonly response: StoredResponse }
  | { readonly ok: false; readonly findings: readonly Diagnostic[] };

type Json = Readonly<Record<string, unknown>>;

/** `answer.value[x]`: the kind each holds, or `null` for a type no supported item holds. */
const ANSWER_VALUES: ReadonlyMap<string, AnswerKind | null> = new Map([
  ['valueBoolean', 'boolean'],
  ['valueDecimal', 'decimal'],
  ['valueInteger', 'integer'],
  ['valueDate', 'date'],
  ['valueDateTime', 'dateTime'],
  ['valueTime', null],
  ['valueString', 'string'],
  ['valueUri', null],
  ['valueAttachment', null],
  ['valueCoding', 'coding'],
  ['valueQuantity', 'quantity'],
  ['valueReference', null],
]);

const IDENTITY = ['identifier', 'subject', 'encounter', 'author'] as const;

export function decodeResponse(json: unknown): DecodeResult {
  const findings: Diagnostic[] = [];
  const reject = (code: 'not-a-questionnaire' | 'malformed' | 'modifier-extension', path: string | null, detail: string): void => {
    findings.push(diagnostic(code, 'error', path, { detail }));
  };
  if (!isRecord(json) || json['resourceType'] !== 'QuestionnaireResponse') {
    reject('not-a-questionnaire', null, isRecord(json) && typeof json['resourceType'] === 'string' ? json['resourceType'] : 'resourceType');
    return { ok: false, findings };
  }

  const questionnaire = json['questionnaire'];
  if (questionnaire !== undefined && typeof questionnaire !== 'string') reject('malformed', null, 'questionnaire');
  const identity: Record<string, object> = {};
  for (const key of IDENTITY) {
    const value = json[key];
    if (isRecord(value)) identity[key] = value;
    else if (value !== undefined) reject('malformed', null, key);
  }

  const readItems = (parent: Json, path: string | null): StoredItem[] => {
    if (parent['modifierExtension'] !== undefined) reject('modifier-extension', path, 'modifierExtension');
    const items = parent['item'];
    if (items === undefined) return [];
    if (!Array.isArray(items)) {
      reject('malformed', path, 'item');
      return [];
    }
    return items.flatMap((item: unknown, index): StoredItem[] => {
      const linkId = isRecord(item) ? item['linkId'] : undefined;
      if (!isRecord(item) || typeof linkId !== 'string' || linkId === '') {
        reject('malformed', path, `item[${index}]`);
        return [];
      }
      const at = path === null ? encodeURIComponent(linkId) : `${path}/${encodeURIComponent(linkId)}`;
      const answers = item['answer'] === undefined ? [] : item['answer'];
      if (!Array.isArray(answers) || !answers.every(isRecord)) {
        reject('malformed', at, 'answer');
        return [];
      }
      return [
        {
          linkId,
          answers: answers.map(readAnswer),
          items: readItems(item, at),
          answerItems: answers.flatMap((answer) => readItems(answer, at)),
        },
      ];
    });
  };
  const items = readItems(json, null);

  if (findings.length > 0) return { ok: false, findings };
  return {
    ok: true,
    response: {
      questionnaire: typeof questionnaire === 'string' ? questionnaire : null,
      identity: Object.keys(identity).length > 0 ? identity : null,
      items,
    },
  };
}

/**
 * One `value[x]`: typed when it is a well-formed value of a kind the kit
 * holds. `found` names its type as the domain does (`integer`) or, for a type
 * no item holds, as R4 does (`Time`); `malformed` when it is neither readable
 * nor a single `value[x]`.
 */
function readAnswer(json: Json): StoredAnswer {
  const keys = Object.keys(json).filter((key) => /^value[A-Z]/.test(key));
  const [key] = keys;
  const kind = key === undefined ? undefined : ANSWER_VALUES.get(key);
  if (keys.length !== 1 || key === undefined || kind === undefined) return { answer: null, found: 'malformed' };
  if (kind === null) return { answer: null, found: key.slice('value'.length) };
  const raw = json[key];
  // A comparator makes a quantity a range, which no answer holds (as in `enableWhen`, parse.ts).
  if (kind === 'quantity' && isRecord(raw) && raw['comparator'] !== undefined) return { answer: null, found: 'Quantity' };
  const value = kind === 'coding' ? pick(raw, ['system', 'code', 'display']) : kind === 'quantity' ? pick(raw, ['value', 'unit', 'system', 'code']) : raw;
  const answer = { kind, value };
  return isAnswer(answer) ? { answer, found: kind } : { answer: null, found: 'malformed' };
}

function pick(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  return out;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
