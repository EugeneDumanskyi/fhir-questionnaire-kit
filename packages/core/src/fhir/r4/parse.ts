import { isAnswer, isCoding, type Answer, type AnswerKind, type Coding } from '../../kernel/answer.js';
import { diagnostic, type Diagnostic, type DiagnosticCode } from '../../kernel/diagnostic.js';
import type { ConditionInput, DefinitionInput, ExpressionUse, ItemInput, OptionInput } from '../../kernel/input.js';
import { isItemType, isOperator } from '../../kernel/item-type.js';
import { childPath, type ItemPath } from '../../kernel/path.js';
import {
  EXPRESSION_EXTENSIONS,
  ITEM_CONTROL,
  ITEM_CONTROL_SYSTEM,
  MAX_DECIMAL_PLACES,
  MAX_OCCURS,
  MAX_VALUE,
  MIN_OCCURS,
  MIN_VALUE,
  RENDERING_XHTML,
} from './extensions.js';

/**
 * R4 `Questionnaire` JSON in, version-neutral `DefinitionInput` out
 * (ADR-0016). Everything that makes the input *not an R4 Questionnaire* is
 * found here and rejects the load in both modes (INV-D-01): the wrong resource,
 * a non-R4 `fhirVersion` or an R5-only construct, a malformed element, a
 * modifier extension (which R4 forbids a processor to ignore), and R4's
 * rule-severity constraints que-1, que-4, que-6, que-7 and que-10 (M2 plan
 * D4). Every such finding is collected, not just the first.
 *
 * What R4 allows but the kit does not support is *recorded*, not judged: the
 * compiler owns the strict/lenient matrix.
 */
export type ParseResult =
  | { readonly ok: true; readonly input: DefinitionInput }
  | { readonly ok: false; readonly findings: readonly Diagnostic[] };

type Json = Readonly<Record<string, unknown>>;

/** Supported R4 item type codes are the domain's own names; these R4 codes are valid but unsupported. */
const UNSUPPORTED_R4_TYPES: ReadonlySet<string> = new Set(['question', 'time', 'url', 'attachment', 'reference']);

/** Elements R5 added that R4 does not have. Their presence means the resource is not R4. */
const R5_ROOT_ELEMENTS = ['versionAlgorithmString', 'versionAlgorithmCoding', 'copyrightLabel'];
const R5_ITEM_ELEMENTS = ['answerConstraint', 'disabledDisplay'];

/** que-10: the only types `maxLength` may be declared on. */
const MAX_LENGTH_TYPES: ReadonlySet<string> = new Set(['boolean', 'decimal', 'integer', 'string', 'text', 'url', 'open-choice']);

/** `enableWhen.answer[x]`: the answer kind each maps to, or `null` for one no supported item can hold. */
const CONDITION_ANSWERS: ReadonlyMap<string, AnswerKind | null> = new Map([
  ['answerBoolean', 'boolean'],
  ['answerDecimal', 'decimal'],
  ['answerInteger', 'integer'],
  ['answerDate', 'date'],
  ['answerDateTime', 'dateTime'],
  ['answerTime', null],
  ['answerString', 'string'],
  ['answerCoding', 'coding'],
  ['answerQuantity', 'quantity'],
  ['answerReference', null],
]);

/** `minValue` and `maxValue`: R4 allows these six; `time` and `instant` bound no supported item (INV-D-20). */
const LIMIT_VALUES: ReadonlyMap<string, AnswerKind | null> = new Map([
  ['valueInteger', 'integer'],
  ['valueDecimal', 'decimal'],
  ['valueDate', 'date'],
  ['valueDateTime', 'dateTime'],
  ['valueTime', null],
  ['valueInstant', null],
]);

/** `answerOption.value[x]`: the kinds M2 plan D4c supports, and the two it does not. */
const OPTION_VALUES: ReadonlyMap<string, AnswerKind | null> = new Map([
  ['valueInteger', 'integer'],
  ['valueDate', 'date'],
  ['valueTime', null],
  ['valueString', 'string'],
  ['valueCoding', 'coding'],
  ['valueReference', null],
]);

class Findings {
  readonly list: Diagnostic[] = [];

  add(code: DiagnosticCode, path: string | null, detail: string): void {
    this.list.push(diagnostic(code, 'error', path, { detail }));
  }
}

export function parseQuestionnaire(json: unknown): ParseResult {
  const findings = new Findings();
  if (!isRecord(json) || json['resourceType'] !== 'Questionnaire') {
    const found = isRecord(json) && typeof json['resourceType'] === 'string' ? json['resourceType'] : 'resourceType';
    findings.add('not-a-questionnaire', null, found);
    return { ok: false, findings: findings.list };
  }

  checkVersion(json, findings);
  checkModifiers(json, null, findings);
  const url = optionalString(json, 'url', null, findings);
  const version = optionalString(json, 'version', null, findings);
  const expressions = readExpressions(json, null, findings);
  const items = readItems(json, null, findings);

  if (findings.list.length > 0) return { ok: false, findings: findings.list };
  return { ok: true, input: { url: url ?? null, version: version ?? null, items, expressions } };
}

function checkVersion(json: Json, findings: Findings): void {
  const fhirVersion = json['fhirVersion'];
  if (fhirVersion !== undefined && (typeof fhirVersion !== 'string' || !/^4\.0(\.|$)/.test(fhirVersion))) {
    findings.add('not-r4', null, 'fhirVersion');
  }
  for (const element of R5_ROOT_ELEMENTS) {
    if (element in json) findings.add('not-r4', null, element);
  }
}

function checkModifiers(json: Json, path: string | null, findings: Findings): void {
  const modifiers = json['modifierExtension'];
  if (modifiers === undefined) return;
  if (!Array.isArray(modifiers)) {
    findings.add('malformed', path, 'modifierExtension');
    return;
  }
  for (const extension of modifiers) {
    const url = isRecord(extension) && typeof extension['url'] === 'string' ? extension['url'] : 'modifierExtension';
    findings.add('modifier-extension', path, url);
  }
}

function readItems(parent: Json, path: ItemPath | null, findings: Findings): ItemInput[] {
  const items = optionalArray(parent, 'item', path, findings);
  const read: ItemInput[] = [];
  items.forEach((item, index) => {
    if (!isRecord(item)) {
      findings.add('malformed', path, `item[${index}]`);
      return;
    }
    const parsed = readItem(item, path, index, findings);
    if (parsed !== null) read.push(parsed);
  });
  return read;
}

function readItem(json: Json, parent: ItemPath | null, index: number, findings: Findings): ItemInput | null {
  const linkId = json['linkId'];
  const type = json['type'];
  if (typeof linkId !== 'string' || linkId === '') {
    findings.add('malformed', parent, `item[${index}]${'.linkId'}`);
    return null;
  }
  const path = childPath(parent, linkId);
  if (typeof type !== 'string' || !(isItemType(type) || UNSUPPORTED_R4_TYPES.has(type))) {
    findings.add(type === 'coding' ? 'not-r4' : 'malformed', path, typeof type === 'string' ? type : 'type');
    return null;
  }

  checkModifiers(json, path, findings);
  for (const element of R5_ITEM_ELEMENTS) {
    if (element in json) findings.add('not-r4', path, element);
  }
  const children = readItems(json, path, findings);
  const item: ItemInput = {
    linkId,
    type: isItemType(type) ? type : null,
    authoredType: type,
    text: optionalString(json, 'text', path, findings) ?? '',
    required: optionalBoolean(json, 'required', path, findings),
    repeats: optionalBoolean(json, 'repeats', path, findings),
    children,
    enableWhen: optionalArray(json, 'enableWhen', path, findings).flatMap((condition, i) =>
      readCondition(condition, path, i, findings),
    ),
    enableBehavior: readEnableBehavior(json, path, findings),
    options: optionalArray(json, 'answerOption', path, findings).flatMap((option, i) => readOption(option, path, i, findings)),
    valueSet: optionalString(json, 'answerValueSet', path, findings) ?? null,
    maxLength: optionalInteger(json['maxLength'], path, 'maxLength', findings),
    minValue: limitExtension(json, MIN_VALUE, path, findings),
    maxValue: limitExtension(json, MAX_VALUE, path, findings),
    maxDecimalPlaces: integerExtension(json, MAX_DECIMAL_PLACES, path, findings),
    minOccurs: integerExtension(json, MIN_OCCURS, path, findings),
    maxOccurs: integerExtension(json, MAX_OCCURS, path, findings),
    itemControl: readItemControl(json),
    renderingXhtml: readRenderingXhtml(json),
    expressions: readExpressions(json, path, findings),
    hasInitial: hasInitial(json),
  };
  checkConstraints(json, item, path, findings);
  return item;
}

/** que-1, que-4, que-6, que-10: R4 rule-severity constraints on an item. */
function checkConstraints(json: Json, item: ItemInput, path: string, findings: Findings): void {
  if (item.authoredType === 'group' && item.children.length === 0) findings.add('r4-constraint', path, 'que-1');
  if (item.authoredType === 'display' && item.children.length > 0) findings.add('r4-constraint', path, 'que-1');
  if (json['answerOption'] !== undefined && json['answerValueSet'] !== undefined) findings.add('r4-constraint', path, 'que-4');
  if (item.authoredType === 'display' && (json['required'] !== undefined || json['repeats'] !== undefined)) {
    findings.add('r4-constraint', path, 'que-6');
  }
  if (item.maxLength !== null && !MAX_LENGTH_TYPES.has(item.authoredType)) findings.add('r4-constraint', path, 'que-10');
}

function readEnableBehavior(json: Json, path: string, findings: Findings): 'all' | 'any' | null {
  const behavior = json['enableBehavior'];
  if (behavior === undefined) return null;
  if (behavior === 'all' || behavior === 'any') return behavior;
  findings.add('malformed', path, 'enableBehavior');
  return null;
}

function readCondition(json: unknown, path: string, index: number, findings: Findings): ConditionInput[] {
  const at = `enableWhen[${index}]`;
  if (!isRecord(json) || typeof json['question'] !== 'string' || json['question'] === '') {
    findings.add('malformed', path, `${at}.question`);
    return [];
  }
  const operator = json['operator'];
  if (typeof operator !== 'string' || !isOperator(operator)) {
    findings.add('malformed', path, `${at}.operator`);
    return [];
  }
  checkModifiers(json, path, findings);
  const choice = onlyChoice(json, 'answer', CONDITION_ANSWERS);
  if (choice === null) {
    findings.add('malformed', path, `${at}.answer[x]`);
    return [];
  }
  const answer = typedValue(choice.kind, json[choice.key]);
  if (answer === undefined) {
    findings.add('malformed', path, `${at}.${choice.key}`);
    return [];
  }
  if (operator === 'exists' && choice.key !== 'answerBoolean') findings.add('r4-constraint', path, 'que-7');
  return [{ question: json['question'], operator, answer, answerType: choice.key.slice('answer'.length) }];
}

function readOption(json: unknown, path: string, index: number, findings: Findings): OptionInput[] {
  const choice = isRecord(json) ? onlyChoice(json, 'value', OPTION_VALUES) : null;
  const value = isRecord(json) && choice !== null ? typedValue(choice.kind, json[choice.key]) : undefined;
  if (!isRecord(json) || choice === null || value === undefined) {
    findings.add('malformed', path, `answerOption[${index}]`);
    return [];
  }
  checkModifiers(json, path, findings);
  return [{ value, valueType: choice.key.slice('value'.length) }];
}

/**
 * The single `prefix[x]` element a choice type allows. `null` when there is
 * none, more than one, or one this map does not know.
 */
function onlyChoice(json: Json, prefix: string, known: ReadonlyMap<string, AnswerKind | null>): { key: string; kind: AnswerKind | null } | null {
  const keys = Object.keys(json).filter((key) => key.startsWith(prefix) && key.length > prefix.length && /^[A-Z]/.test(key.slice(prefix.length)));
  const [key] = keys;
  if (keys.length !== 1 || key === undefined || !known.has(key)) return null;
  return { key, kind: known.get(key) ?? null };
}

/**
 * The domain answer for an R4 value of a known kind; `null` when the kind is
 * unsupported (the value is not inspected); `undefined` when it is malformed.
 */
function typedValue(kind: AnswerKind | null, raw: unknown): Answer | null | undefined {
  if (kind === null) return null;
  const value = kind === 'coding' ? neutralCoding(raw) : kind === 'quantity' ? neutralQuantity(raw) : raw;
  if (value === null) return null;
  const answer = { kind, value };
  return isAnswer(answer) ? answer : undefined;
}

/** A Coding reduced to what the domain compares and shows; `undefined` stands for malformed. */
function neutralCoding(raw: unknown): Coding | undefined {
  if (!isRecord(raw)) return undefined;
  const coding = pick(raw, ['system', 'code', 'display']);
  return isCoding(coding) ? coding : undefined;
}

/** A Quantity with a comparator means a range, not a value; the kit cannot compare it (`null`). */
function neutralQuantity(raw: unknown): object | null | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw['comparator'] !== undefined) return null;
  return pick(raw, ['value', 'unit', 'system', 'code']);
}

function pick(json: Json, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (json[key] !== undefined) out[key] = json[key];
  }
  return out;
}

function readExpressions(json: Json, path: string | null, findings: Findings): ExpressionUse[] {
  return extensions(json).flatMap((extension): ExpressionUse[] => {
    const url = extension['url'];
    const kind = typeof url === 'string' ? EXPRESSION_EXTENSIONS.get(url) : undefined;
    if (kind === undefined || typeof url !== 'string') return [];
    const value = extension['valueExpression'];
    if (value !== undefined && !isRecord(value)) {
      findings.add('malformed', path, url);
      return [];
    }
    return [{ kind, url, language: stringOrNull(value?.['language']), expression: stringOrNull(value?.['expression']), name: stringOrNull(value?.['name']) }];
  });
}

/** `questionnaire-minOccurs`, `-maxOccurs` and `maxDecimalPlaces` carry a non-negative `valueInteger`. */
function integerExtension(json: Json, url: string, path: string, findings: Findings): number | null {
  const extension = extensions(json).find((candidate) => candidate['url'] === url);
  if (extension === undefined) return null;
  const value = extension['valueInteger'];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  findings.add('malformed', path, url);
  return null;
}

/** `minValue` and `maxValue` carry one `value[x]` of the kinds R4 lists. */
function limitExtension(json: Json, url: string, path: string, findings: Findings): OptionInput | null {
  const extension = extensions(json).find((candidate) => candidate['url'] === url);
  if (extension === undefined) return null;
  const choice = onlyChoice(extension, 'value', LIMIT_VALUES);
  const value = choice === null ? undefined : typedValue(choice.kind, extension[choice.key]);
  if (choice === null || value === undefined) {
    findings.add('malformed', path, url);
    return null;
  }
  return { value, valueType: choice.key.slice('value'.length) };
}

function readItemControl(json: Json): string | null {
  const extension = extensions(json).find((candidate) => candidate['url'] === ITEM_CONTROL);
  const concept = extension?.['valueCodeableConcept'];
  const codings = isRecord(concept) && Array.isArray(concept['coding']) ? concept['coding'] : [];
  const coding = codings.find(
    (candidate): candidate is Json =>
      isRecord(candidate) && (candidate['system'] === undefined || candidate['system'] === ITEM_CONTROL_SYSTEM),
  );
  return stringOrNull(coding?.['code']);
}

function readRenderingXhtml(json: Json): string | null {
  const text = json['_text'];
  const extension = isRecord(text) ? extensions(text).find((candidate) => candidate['url'] === RENDERING_XHTML) : undefined;
  return stringOrNull(extension?.['valueString']);
}

function hasInitial(json: Json): boolean {
  const initial = json['initial'];
  const options = json['answerOption'];
  return (
    (Array.isArray(initial) && initial.length > 0) ||
    (Array.isArray(options) && options.some((option) => isRecord(option) && option['initialSelected'] === true))
  );
}

function extensions(json: Json): Json[] {
  const list = json['extension'];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

function optionalArray(json: Json, key: string, path: string | null, findings: Findings): readonly unknown[] {
  const value = json[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  findings.add('malformed', path, key);
  return [];
}

function optionalString(json: Json, key: string, path: string | null, findings: Findings): string | undefined {
  const value = json[key];
  if (value === undefined || typeof value === 'string') return value;
  findings.add('malformed', path, key);
  return undefined;
}

function optionalBoolean(json: Json, key: string, path: string, findings: Findings): boolean {
  const value = json[key];
  if (value === undefined || typeof value === 'boolean') return value === true;
  findings.add('malformed', path, key);
  return false;
}

function optionalInteger(value: unknown, path: string, name: string, findings: Findings): number | null {
  if (value === undefined) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  findings.add('malformed', path, name);
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
