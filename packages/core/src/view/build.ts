import type { Answer, Issue, NodeState, SessionState } from '../index.js';
import type { Catalogue } from './catalogue.js';
import { controlKind, isChoice, optionsOf, sameChoice } from './controls.js';
import type { EntryType, Unit } from './drafts.js';
import { fill, formatAnswer, formatDateTime, formatList, formatNumber, plural, scaleOf } from './format.js';
import { nodeIds } from './ids.js';
import type { ChoiceView, InstanceView, ViewIssue, ViewNode } from './types.js';

/**
 * One view node from one `NodeState` (ADR-0007): control choice, ids, issue
 * text, options and their state, entries and repeat metadata, with the
 * commands bound to its path. Pure: everything the view holds comes in
 * through the context.
 */

/** What a node's commands do. One `set` serves every kind; it reads the node's state when called, not when bound. */
export interface Commands {
  readonly set: (value: string | readonly string[]) => void;
  readonly setAt: (index: number, text: string) => void;
  readonly setUnit: (unit: string) => void;
  readonly setOther: (text: string) => void;
  readonly toggle: (key: string) => void;
  readonly clear: () => void;
  readonly leave: () => void;
  readonly retry: () => void;
  readonly add: () => void;
  readonly remove: () => void;
}

export interface Context {
  readonly messages: Catalogue;
  readonly locale: string;
  readonly timeZone: string | undefined;
  readonly idPrefix: string;
  readonly sets: SessionState['optionSets'];
  readonly commands: (path: string) => Commands;
  /** The node's entries as typed or as answered, and whether any text is not a value yet (INV-P-06). */
  readonly texts: (state: NodeState) => { readonly texts: readonly string[]; readonly answers: readonly Answer[]; readonly invalid: boolean };
  readonly unit: (state: NodeState) => Unit;
}

const NONE: readonly never[] = [];

/** What an entry node's text is typed as; `null` for a node with no text entry. */
export function entryType(state: NodeState): EntryType | null {
  const { type, calculated } = state.item;
  const entry = type === 'string' || type === 'text' || type === 'integer' || type === 'decimal' || type === 'date' || type === 'dateTime' || type === 'quantity';
  return entry && !calculated ? type : null;
}

/** An answer as text for reading: a boolean in the catalogue's words, anything else through `Intl` (ADR-0020). */
function show(answer: Answer, cx: Context, scale?: number): string {
  if (answer.kind === 'boolean') return answer.value ? cx.messages.yes : cx.messages.no;
  return formatAnswer(answer, cx.locale, cx.timeZone, scale);
}

/**
 * A choice node's options, each keyed by position. An answer that matches no
 * option (a resumed code, T8) is kept as an option of its own, selected, so
 * the screen never hides an answer the response holds; an open-choice item's
 * free text is its `other`.
 */
export function choiceParts(state: NodeState, cx: Pick<Context, 'sets' | 'messages' | 'locale' | 'timeZone'>) {
  const { answers: offered, state: optionState } = optionsOf(state.item, cx.sets);
  const open = state.item.type === 'open-choice';
  let other: string | null = null;
  const extra: Answer[] = [];
  for (const answer of state.answers) {
    if (offered.some((option) => sameChoice(answer, option))) continue;
    if (open && answer.kind === 'string' && other === null) other = answer.value;
    else extra.push(answer);
  }
  const answers = [...offered, ...extra];
  const options = answers.map((answer, position): ChoiceView => ({
    key: String(position),
    label: show(answer, cx as Context),
    selected: state.answers.some((given) => sameChoice(given, answer)),
  }));
  return { answers, options, other, state: optionState };
}

/** An issue's text, with its limit and the value entered, formatted (AC-04.2.1, M3 plan D1). */
export function issueText(issue: Issue, cx: Pick<Context, 'messages' | 'locale' | 'timeZone'>, state?: NodeState, shown = ''): string {
  const { limit } = issue.params;
  const [first] = state?.answers ?? NONE;
  const count = (value: number) => formatNumber(value, cx.locale);
  const value =
    issue.code === 'max-length'
      ? count(first?.kind === 'string' ? [...first.value].length : 0)
      : issue.code === 'min-occurs' || issue.code === 'max-occurs'
        ? count(state?.item.type === 'group' ? state.instances.length : (state?.answers.length ?? 0))
        : shown;
  const limitText = limit === undefined ? {} : { limit: typeof limit === 'number' ? count(limit) : formatDateTime(limit, cx.locale, cx.timeZone) };
  return cx.messages.issue(issue, { value, ...limitText });
}

/** A node's surfaced issues (SM-03), the view's own last and only once shown. */
function issuesOf(state: NodeState, cx: Context, shown: string, own: ViewIssue | null): { issues: readonly ViewIssue[]; invalid: boolean } {
  const issues: ViewIssue[] = state.surfaced ? state.issues.map((issue) => ({ rule: issue.code, message: issueText(issue, cx, state, shown) })) : [];
  if (own !== null) issues.push(own);
  return issues.length > 0 ? { issues, invalid: true } : { issues: NONE, invalid: false };
}

export function nodeView(state: NodeState, children: readonly ViewNode[], instances: readonly InstanceView[], shown: boolean, cx: Context): ViewNode {
  const { path, item } = state;
  const bound = cx.commands(path);
  const control = controlKind(item, optionsOf(item, cx.sets).answers.length);
  const base = { path, label: item.text, richLabel: item.xhtml, description: null, ids: nodeIds(cx.idPrefix, path), required: item.required, leave: bound.leave };
  if (isChoice(control)) return choiceView(state, control, base, bound, cx);
  if (entryType(state) !== null) return entryView(state, control, base, bound, shown, cx);
  const quiet = issuesOf(state, cx, '', null);
  switch (control) {
    case 'group':
      return { ...base, ...quiet, control, children };
    case 'repeating-group': {
      const canAdd = item.maxOccurs === null || state.instances.length < item.maxOccurs;
      const reason = canAdd ? null : plural(cx.messages.atMaxOccurs, item.maxOccurs ?? 0, cx.locale);
      return { ...base, ...quiet, control, instances, canAdd, reason, addLabel: fill(cx.messages.addInstance, { label: item.text }), add: bound.add };
    }
    case 'yes-no':
      return yesNoView(state, base, bound, cx);
    case 'calculated': {
      const [value = null] = state.answers;
      return { ...base, ...quiet, control, value, display: value === null ? cx.messages.scoreUnavailable : show(value, cx) };
    }
    case 'unsupported':
      return { ...base, ...quiet, control, notice: cx.messages.unsupported };
    default:
      return { ...base, ...quiet, control: 'statement' };
  }
}

type Base = Pick<ViewNode, 'path' | 'label' | 'richLabel' | 'description' | 'ids' | 'required' | 'leave'>;

function yesNoView(state: NodeState, base: Base, bound: Commands, cx: Context): ViewNode {
  const [answer] = state.answers;
  const value = answer?.kind === 'boolean' ? answer.value : null;
  const display = value === null ? '' : show({ kind: 'boolean', value }, cx);
  return {
    ...base,
    ...issuesOf(state, cx, display, null),
    control: 'yes-no',
    value,
    display,
    options: [
      { key: 'true', label: cx.messages.yes, selected: value === true },
      { key: 'false', label: cx.messages.no, selected: value === false },
    ],
    set: bound.set,
    clear: bound.clear,
  };
}

function choiceView(state: NodeState, control: ViewNode['control'], base: Base, bound: Commands, cx: Context): ViewNode {
  const parts = choiceParts(state, cx);
  const { messages } = cx;
  const display = formatList(state.answers.map((answer) => show(answer, cx)), cx.locale);
  const optionMessage = { ready: null, pending: messages.optionsPending, failed: messages.optionsFailed, unavailable: messages.optionsUnavailable }[parts.state];
  const common = {
    ...base,
    ...issuesOf(state, cx, display, null),
    display,
    options: parts.options,
    optionState: parts.state,
    optionMessage,
    retry: bound.retry,
    other: state.item.type === 'open-choice' ? (parts.other ?? '') : null,
    setOther: bound.setOther,
    clear: bound.clear,
  };
  const picked = parts.answers.filter((_, position) => parts.options[position]?.selected === true);
  return control === 'multi-choice' || control === 'multi-list'
    ? { ...common, control, value: picked, set: bound.set, toggle: bound.toggle }
    : { ...common, control: control as 'single-choice' | 'single-list' | 'single-menu', value: picked[0] ?? null, set: bound.set };
}

/** The view's own issue on text that is not a value yet, once it shows (INV-P-06). */
function draftIssue(type: EntryType | null, invalid: boolean, shown: boolean, messages: Catalogue): ViewIssue | null {
  if (!invalid || !shown) return null;
  return type === 'date' || type === 'dateTime' ? { rule: 'not-a-date', message: messages.issueNotADate } : { rule: 'not-a-number', message: messages.issueNotANumber };
}

/** A quantity's units: the permitted ones as options, or the typed one (AC-01.2.4). */
function unitsOf(state: NodeState, cx: Context) {
  const unit = cx.unit(state);
  const { units } = state.item;
  const [first] = state.answers;
  return {
    value: first?.kind === 'quantity' ? first.value : null,
    units: units.map((coding, i): ChoiceView => ({
      key: String(i),
      label: coding.display ?? coding.code ?? '',
      selected: coding.system === unit.system && coding.code === unit.code && (coding.code !== undefined || coding.display === unit.unit),
    })),
    unit: units.length > 0 ? '' : (unit.unit ?? ''),
  };
}

/** Entry kinds: text as typed, with the view's issue on text that is not a value yet (INV-P-06). */
function entryView(state: NodeState, control: ViewNode['control'], base: Base, bound: Commands, shown: boolean, cx: Context): ViewNode {
  const { item } = state;
  const type = entryType(state);
  const { texts, answers, invalid } = cx.texts(state);
  const typed = texts.filter((text) => text !== '');
  const numeric = type === 'decimal' || type === 'quantity';
  const display = formatList(answers.map((answer, i) => show(answer, cx, numeric ? scaleOf(typed[i] ?? '') : undefined)), cx.locale);
  const more = item.maxOccurs === null || answers.length < item.maxOccurs;
  const raw = state.answers[0]?.value;
  const entry = {
    ...base,
    ...issuesOf(state, cx, display, draftIssue(type, invalid, shown, cx.messages)),
    display,
    entry: texts[0] ?? '',
    entries: item.repeats ? (more ? [...texts, ''] : texts) : null,
    set: bound.set,
    setAt: bound.setAt,
    clear: bound.clear,
  };
  if (control === 'quantity') return { ...entry, control, ...unitsOf(state, cx), setUnit: bound.setUnit };
  return control === 'integer' || control === 'decimal'
    ? { ...entry, control, value: typeof raw === 'number' ? raw : null }
    : { ...entry, control: control as 'short-text' | 'long-text' | 'calendar-date' | 'date-time', value: typeof raw === 'string' ? raw : null };
}

/** One repeat instance: named by the group's label and its position (AC-11.2.1). */
export function instanceView(path: string, number: number, groupLabel: string, children: readonly ViewNode[], cx: Context): InstanceView {
  const label = fill(cx.messages.instanceLabel, { label: groupLabel, count: formatNumber(number, cx.locale) });
  return { path, number, label, ids: nodeIds(cx.idPrefix, path), children, removeLabel: fill(cx.messages.removeInstance, { label }), remove: cx.commands(path).remove };
}
