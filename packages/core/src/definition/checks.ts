import type { AnswerKind } from '../kernel/answer.js';
import { slot } from '../kernel/dense.js';
import { diagnostic, type Diagnostic, type DiagnosticCode, type Severity } from '../kernel/diagnostic.js';
import type { Answer } from '../kernel/answer.js';
import type { ConditionInput, DefinitionInput, ExpressionUse, ItemInput, OptionInput } from '../kernel/input.js';
import type { ItemType, Operator } from '../kernel/item-type.js';
import { childPath, type ItemPath } from '../kernel/path.js';
import type { CompiledCondition, ItemDef, LoadMode } from './compile.js';

/**
 * The load-time strict/lenient matrix (`04-domain.md` §5.1). Each finding says
 * whether it rejects the load always, only in `strict` mode, or never; the
 * compiler applies the mode. Lenient degradation always leans to the safe
 * side: a condition that cannot be evaluated is `false`, an item that cannot be
 * answered is a placeholder, an item gated by an expression is disabled.
 */

export interface Finding {
  readonly diagnostic: Diagnostic;
  readonly rejects: 'always' | 'strict' | 'never';
}

export type DraftItem = Omit<ItemDef, 'dependents' | 'rank'>;

interface Walked {
  readonly input: ItemInput;
  readonly id: number;
  readonly parent: number;
  readonly path: ItemPath;
  /** Under an item that has children but is not a group (INV-D-17). */
  readonly underQuestion: boolean;
}

const EQUALITY: readonly Operator[] = ['=', '!='];
const ORDERED: readonly Operator[] = ['=', '!=', '>', '<', '>=', '<='];

/**
 * M2 plan D3: which answer kinds and operators a condition may use against
 * each question type. Anything else is INV-D-06 and evaluates `false`.
 */
export const COMPARABLE: Readonly<Record<ItemType, { readonly kinds: readonly AnswerKind[]; readonly operators: readonly Operator[] }>> = {
  group: { kinds: [], operators: [] },
  display: { kinds: [], operators: [] },
  boolean: { kinds: ['boolean'], operators: EQUALITY },
  decimal: { kinds: ['decimal', 'integer'], operators: ORDERED },
  integer: { kinds: ['integer', 'decimal'], operators: ORDERED },
  date: { kinds: ['date'], operators: ORDERED },
  dateTime: { kinds: ['dateTime'], operators: ORDERED },
  string: { kinds: ['string'], operators: EQUALITY },
  text: { kinds: ['string'], operators: EQUALITY },
  choice: { kinds: ['coding', 'string', 'integer', 'date'], operators: EQUALITY },
  'open-choice': { kinds: ['coding', 'string', 'integer', 'date'], operators: EQUALITY },
  quantity: { kinds: ['quantity'], operators: ORDERED },
};

export function checkItems(input: DefinitionInput, mode: LoadMode, evaluator = false): { items: DraftItem[] | null; findings: Finding[] } {
  const findings: Finding[] = [];
  const add: Add = (code, rejects, path, extra = {}) => {
    // A finding that rejects in strict mode is an `error` in both modes, so a
    // lenient host can tell a degraded item from a remark (kernel/diagnostic.ts).
    const severity: Severity = rejects === 'never' ? 'warning' : 'error';
    findings.push({ diagnostic: diagnostic(code, severity, path, extra), rejects });
  };

  const walked = walk(input.items);
  const byLinkId = new Map<string, number>();
  for (const item of walked) {
    if (byLinkId.has(item.input.linkId)) {
      add('duplicate-link-id', 'always', item.path, { related: [item.input.linkId] });
    } else {
      byLinkId.set(item.input.linkId, item.id);
    }
  }
  if (findings.length > 0) return { items: null, findings };

  for (const use of input.expressions) checkExpression(use, null, evaluator, add);
  const children = walked.map((): number[] => []);
  for (const item of walked) if (item.parent !== -1) slot(children, item.parent).push(item.id);
  const drafts = walked.map((item) => draft(item, walked, slot(children, item.id), mode, evaluator, add));
  for (const [id, item] of walked.entries()) {
    const conditions = item.input.enableWhen.map((condition) => compileCondition(condition, id, drafts, byLinkId, item.path, add));
    drafts[id] = { ...slot(drafts, id), conditions };
  }
  return { items: drafts, findings };
}

type Add = (code: DiagnosticCode, rejects: Finding['rejects'], path: string | null, extra?: { related?: readonly string[]; detail?: string }) => void;

/** Flattens the tree in document (pre-)order, which is what makes ids dense and ordered. */
function walk(roots: readonly ItemInput[]): Walked[] {
  const out: Walked[] = [];
  const visit = (input: ItemInput, parent: number, parentPath: ItemPath | null, underQuestion: boolean): void => {
    const id = out.length;
    const path = childPath(parentPath, input.linkId);
    out.push({ input, id, parent, path, underQuestion });
    const question = input.type !== 'group' && input.children.length > 0;
    for (const child of input.children) visit(child, id, path, underQuestion || question);
  };
  for (const root of roots) visit(root, -1, null, false);
  return out;
}

function draft(item: Walked, walked: readonly Walked[], children: readonly number[], mode: LoadMode, evaluator: boolean, add: Add): DraftItem {
  const { input, path } = item;
  const placeholder = checkShape(input, path, add) || item.underQuestion;
  const { forcedDisabled, calculation, optionless } = checkExpressions(input, path, mode, evaluator, add);
  const type = placeholder ? null : input.type;
  // Lenient `answerExpression` and `candidateExpression`: the item has no options,
  // and takes no coded answer, as an unresolved value set (ADR-0017, M2 plan D13).
  const options = optionless ? [] : input.options.flatMap((option) => (option.value === null ? [] : [option.value]));
  const accepts = acceptedKinds(type, options);
  const limits = checkLimits(input, type, path, add);

  return {
    id: item.id,
    linkId: input.linkId,
    path,
    type,
    authoredType: input.authoredType,
    text: input.text,
    required: input.required,
    repeats: input.repeats && !placeholder,
    parent: item.parent,
    children,
    repeatScope: nearestRepeat(item.parent, walked),
    conditions: [],
    behavior: input.enableBehavior ?? 'all',
    forcedDisabled,
    calculated: calculation !== null,
    calculation: evaluator ? calculation : null,
    options,
    valueSet: input.valueSet,
    accepts: optionless ? accepts.filter((kind) => kind !== 'coding') : accepts,
    maxLength: input.maxLength,
    ...limits,
    itemControl: input.itemControl,
    renderingXhtml: input.renderingXhtml,
  };
}

/** INV-D-03, 16, 17, 18 and 19. Returns whether the item can only be a placeholder. */
function checkShape(input: ItemInput, path: string, add: Add): boolean {
  let placeholder = false;
  if (input.type === null) {
    add('unsupported-item-type', 'strict', path, { detail: input.authoredType });
    placeholder = true;
  }
  if (input.type !== 'group' && input.children.length > 0) add('items-under-question', 'strict', path);
  // Once per value type: two `time` options are one finding, not two.
  const unsupported = new Set(input.options.flatMap((option) => (option.value === null ? [option.valueType] : [])));
  for (const valueType of unsupported) {
    add('unsupported-option-type', 'strict', path, { detail: valueType });
    placeholder = true;
  }
  if (input.hasInitial) add('initial-value-ignored', 'never', path);
  if (input.enableWhen.length > 1 && input.enableBehavior === null) add('missing-enable-behavior', 'strict', path);
  return placeholder;
}

/** What each item type accepts (INV-S-10). A choice accepts the kinds its options have, `coding` when it has none. */
function acceptedKinds(type: ItemType | null, options: readonly Answer[]): readonly AnswerKind[] {
  const coded: AnswerKind[] = options.length === 0 ? ['coding'] : [...new Set(options.map((option) => option.kind))];
  switch (type) {
    case 'choice':
      return coded;
    case 'open-choice':
      return coded.includes('string') ? coded : [...coded, 'string'];
    case 'text':
      return ['string'];
    case 'group':
    case 'display':
    case null:
      return [];
    default:
      return [type];
  }
}

/** INV-D-20: the kinds a `minValue` or `maxValue` may have on each item type. */
const LIMIT_KINDS: Partial<Readonly<Record<ItemType, readonly AnswerKind[]>>> = {
  integer: ['integer', 'decimal'],
  decimal: ['decimal', 'integer'],
  date: ['date'],
  dateTime: ['dateTime'],
};

type Limits = Pick<DraftItem, 'minValue' | 'maxValue' | 'maxDecimalPlaces' | 'minOccurs' | 'maxOccurs'>;

/**
 * INV-D-20: a value or cardinality constraint applies to the item's type, and
 * `minOccurs` is at most `maxOccurs`. One that does not rejects a strict load
 * and is ignored in a lenient one.
 */
function checkLimits(input: ItemInput, type: ItemType | null, path: string, add: Add): Limits {
  const inapplicable = (detail: string): null => {
    add('inapplicable-constraint', 'strict', path, { detail });
    return null;
  };
  const limit = (authored: OptionInput | null, name: string): Answer | null => {
    if (authored === null) return null;
    const kinds = type === null ? undefined : LIMIT_KINDS[type];
    return authored.value !== null && kinds?.includes(authored.value.kind) === true ? authored.value : inapplicable(name);
  };
  const decimalPlaces = input.maxDecimalPlaces === null || type === 'decimal' || type === 'quantity' ? input.maxDecimalPlaces : inapplicable('maxDecimalPlaces');
  const authored = input.minOccurs !== null || input.maxOccurs !== null;
  const contradictory = input.minOccurs !== null && input.maxOccurs !== null && input.minOccurs > input.maxOccurs;
  const keepOccurs = !authored || (input.repeats && type !== null && !contradictory);
  if (!keepOccurs) inapplicable('occurs');
  return {
    minValue: limit(input.minValue, 'minValue'),
    maxValue: limit(input.maxValue, 'maxValue'),
    maxDecimalPlaces: decimalPlaces,
    minOccurs: keepOccurs ? (input.minOccurs ?? 0) : 0,
    maxOccurs: keepOccurs ? input.maxOccurs : null,
  };
}

function checkExpressions(
  input: ItemInput,
  path: string,
  mode: LoadMode,
  evaluator: boolean,
  add: Add,
): { forcedDisabled: boolean; calculation: DraftItem['calculation']; optionless: boolean } {
  let forcedDisabled = false;
  let calculation: DraftItem['calculation'] = null;
  let optionless = false;
  for (const use of input.expressions) {
    checkExpression(use, path, evaluator, add);
    forcedDisabled ||= use.kind === 'enableWhen' && mode === 'lenient';
    optionless ||= use.kind === 'answer' || use.kind === 'candidate';
    if (use.kind === 'calculated') {
      calculation ??= { language: use.language ?? '', expression: use.expression ?? '', ...(use.name === null ? {} : { name: use.name }) };
    }
  }
  return { forcedDisabled, calculation, optionless };
}

/** INV-D-09 and INV-D-15: what each expression extension costs. A `calculatedExpression` costs nothing with an evaluator. */
function checkExpression(use: ExpressionUse, path: string | null, evaluator: boolean, add: Add): void {
  switch (use.kind) {
    case 'calculated':
      if (!evaluator) add('no-evaluator', 'never', path, { detail: use.url });
      return;
    case 'variable':
    case 'launchContext':
      add('context-extension-ignored', 'never', path, { detail: use.url });
      return;
    default:
      add('unsupported-extension', 'strict', path, { detail: use.url });
  }
}

function nearestRepeat(start: number, walked: readonly Walked[]): number {
  for (let id = start; id !== -1; id = slot(walked, id).parent) {
    const { input, underQuestion } = slot(walked, id);
    if (input.type === 'group' && input.repeats && !underQuestion) return id;
  }
  return -1;
}

/** Strict ancestors of `id` that are repeating groups, innermost first. */
function repeatingAncestors(id: number, drafts: readonly DraftItem[]): number[] {
  const out: number[] = [];
  for (let scope = slot(drafts, id).repeatScope; scope !== -1; scope = slot(drafts, scope).repeatScope) out.push(scope);
  return out;
}

function isAncestor(ancestor: number, id: number, drafts: readonly DraftItem[]): boolean {
  for (let current = slot(drafts, id).parent; current !== -1; current = slot(drafts, current).parent) {
    if (current === ancestor) return true;
  }
  return false;
}

const NEVER: CompiledCondition = { kind: 'never' };

/** INV-D-04, INV-D-14, INV-D-13 and INV-D-06, in that order; the first that applies decides. */
function compileCondition(
  condition: ConditionInput,
  dependent: number,
  drafts: readonly DraftItem[],
  byLinkId: ReadonlyMap<string, number>,
  path: string,
  add: Add,
): CompiledCondition {
  const related = [condition.question];
  const question = byLinkId.get(condition.question);
  if (question === undefined) {
    add('dangling-condition', 'strict', path, { related });
    return NEVER;
  }
  const target = slot(drafts, question);
  if (target.calculated) {
    add('condition-on-calculated', 'strict', path, { related });
    return NEVER;
  }
  if (repeatingAncestors(question, drafts).some((scope) => !isAncestor(scope, dependent, drafts))) {
    add('condition-crosses-repeat', 'strict', path, { related });
    return NEVER;
  }
  if (condition.answer === null || !meaningful(target.type, condition.operator, condition.answer.kind)) {
    add('meaningless-condition', 'never', path, { related, detail: condition.operator });
    return NEVER;
  }
  return { kind: 'test', question, operator: condition.operator, answer: condition.answer };
}

function meaningful(type: ItemType | null, operator: Operator, kind: AnswerKind): boolean {
  if (type === null) return false;
  const comparable = COMPARABLE[type];
  if (operator === 'exists') return kind === 'boolean' && comparable.kinds.length > 0;
  return comparable.kinds.includes(kind) && comparable.operators.includes(operator);
}
