import type { ChoiceView, ControlKind, ControlView, InstanceView, ViewIssue, ViewModel, ViewNode } from '@fhirq/core/view';

import { attr, el, on, show, text, textIn } from './dom.js';
import { patch, type List, type Part, type Records } from './patch.js';

/**
 * The control kinds as descriptors, one per kind, which one item builder
 * interprets and the one reconciler keeps in line (ADR-0021 rung 2, M7 plan
 * steps 3b and 4). Markup follows docs/08-dom-contract.md §3.
 *
 * A part writes what its key fixes once, when it is built: an item's path
 * and the ids made from it, a field's place, an option's key. What the node's
 * state changes it writes in `update`, and only where the DOM differs. Its
 * events are handled through `on`, reading the view it last rendered.
 */

/** What every item shares for a view's life: its fixed text, and the heading level a repeat instance's name takes (DOM contract §3.8). */
export interface Cx {
  readonly marker: string;
  readonly labels: ViewModel['labels'];
  readonly level: number;
}

type EntryKind = 'short-text' | 'long-text' | 'integer' | 'decimal' | 'calendar-date' | 'date-time' | 'quantity';
/** The kinds whose options are all shown, as radios or checkboxes. */
type Chosen = 'yes-no' | 'single-choice' | 'multi-choice';
/** The kinds whose options are a `select`. */
type Listed = 'single-list' | 'single-menu' | 'multi-list';

/** A kind's body: its parts between the label and the error container, built into `item` before `end`, and how they follow a node. */
type Body<N extends ViewNode> = (item: HTMLElement, end: Node, node: N, cx: Cx) => (node: N) => void;

/** A body's one element, built on its own, which the body places. */
type Control<N extends ViewNode> = (node: N, cx: Cx) => Part<N, Cx>;

interface Kind<N extends ViewNode> {
  /** A `fieldset` root's stem (§3.7, §3.8), which joins `item` in its class and part; its label is a `legend`. A `div` root has none. */
  readonly stem?: 'group' | 'repeat';
  /**
   * A `div` root's label: a `label` `for` its one control, none where the
   * body names itself (§3.6), or else a `span` that names a group of
   * controls or a value.
   */
  readonly label?: 'for' | 'none';
  /** A read-only kind holds no focus stop, so it is never left (§3.6). */
  readonly still?: true;
  readonly body: Body<N>;
}

/** A body that is one control and nothing else. */
const alone =
  <N extends ViewNode>(control: Control<N>): Body<N> =>
  (item, end, node, cx) => {
    const { root, update } = control(node, cx);
    item.insertBefore(root, end);
    return (next) => update(next, cx);
  };

/**
 * A label's content (§1): `label` as text, or `richLabel` as markup, which is
 * the host sanitizer's output and is written as given (INV-X-06). The markup
 * sits in a `span` with no class, so a required marker can follow it, unless
 * `bare`. Which of the two an item has is its definition's, fixed by its path.
 */
function caption(parent: Element, node: ViewNode, bare = false): (node: ViewNode) => void {
  if (node.richLabel === null) {
    const content = textIn(parent);
    return (next) => text(content, next.label);
  }
  const holder = bare ? parent : parent.appendChild(document.createElement('span'));
  let written: string | null = null;
  return ({ richLabel }) => {
    if (richLabel !== written) {
      written = richLabel;
      holder.innerHTML = richLabel ?? '';
    }
  };
}

/** The ARIA state an answerable control carries, always as strings (§1). */
function state(control: Element, node: ViewNode): void {
  attr(control, 'aria-required', String(node.required));
  attr(control, 'aria-invalid', String(node.invalid));
  attr(control, 'aria-describedby', node.invalid ? node.ids.error : null);
}

/** An item's issues, by position: an issue has no identity of its own, and two may share a rule. */
const ISSUES: List<ViewIssue, null> = {
  key: (_, index) => String(index),
  create() {
    const message = el('p', 'fhirq-error-message', 'error-message');
    const content = textIn(message);
    return { root: message, update: (issue) => text(content, issue.message) };
  },
};

/**
 * One item root (§3): the label with the required marker as its last child,
 * the kind's body, and the error container last. Focus leaving the root, not
 * moving between its own parts, is `leave()` (§1, the leave rule).
 */
function item(kind: Kind<ViewNode>, node: ViewNode, cx: Cx): Part<ViewNode, Cx> {
  const { stem } = kind;
  const root = el(stem === undefined ? 'div' : 'fieldset', 'fhirq-item', 'item');
  root.setAttribute('data-path', node.path);
  const label = kind.label === 'none' ? null : el(stem === undefined ? (kind.label === 'for' ? 'label' : 'span') : 'legend', 'fhirq-label', 'label', root);
  if (label !== null) label.id = node.ids.label;
  if (kind.label === 'for') label?.setAttribute('for', node.ids.control);
  if (stem !== undefined) {
    root.classList.add(`fhirq-${stem}`);
    root.part.add(stem);
    // A summary link may move focus to a group's legend.
    if (label !== null) label.tabIndex = -1;
  }
  const content = label === null ? null : caption(label, node);
  const marker = el('span', 'fhirq-required', 'required');
  marker.setAttribute('aria-hidden', 'true');
  textIn(marker).data = cx.marker;
  const error = el('div', 'fhirq-error', 'error', root);
  error.id = node.ids.error;
  const body = kind.body(root, error, node, cx);
  let issues: Records<ViewIssue, null> = new Map();
  let current = node;
  if (kind.still === undefined) {
    on(root, {
      focusout(event) {
        const next = (event as FocusEvent).relatedTarget;
        if (!(next instanceof Node && root.contains(next))) current.leave();
      },
    });
  }
  return {
    root,
    update(next) {
      current = next;
      content?.(next);
      if (label !== null) show(marker, next.required, label, null);
      if (stem !== undefined) attr(root, 'aria-describedby', next.invalid ? next.ids.error : null);
      body(next);
      attr(error, 'hidden', next.invalid ? null : '');
      issues = patch(error, issues, next.issues, ISSUES, null);
    },
  };
}

interface Choice {
  readonly node: ControlView<Chosen>;
  readonly option: ChoiceView;
  readonly index: number;
}

/** A radio or a checkbox per option, keyed by the option's key, which is its value (§3.2, §3.5). */
const CHOICES: List<Choice, null> = {
  key: ({ option }) => option.key,
  create({ node, option }) {
    const kind = node.control === 'multi-choice' ? 'checkbox' : 'radio';
    const choice = el('label', 'fhirq-choice', 'choice');
    const input = el('input', `fhirq-${kind}`, kind, choice);
    input.type = kind;
    input.value = option.key;
    // Same-name native radios give the roving tab stop and arrow keys (NFR-A-07).
    if (kind === 'radio') input.name = node.ids.control;
    const caption = textIn(el('span', 'fhirq-choice-label', 'choice-label', choice));
    let current = node;
    on(input, { change: () => (current.control === 'multi-choice' ? current.toggle(option.key) : current.set(option.key)) });
    return {
      root: choice,
      update(next) {
        current = next.node;
        // On the first choice: the focusable element a summary link reaches.
        attr(input, 'id', next.index === 0 ? next.node.ids.control : null);
        if (input.checked !== next.option.selected) input.checked = next.option.selected;
        text(caption, next.option.label);
      },
    };
  },
};

/** All options shown (§3.2, §3.5): a radio group, or a group of checkboxes for a multi-choice. */
const choices: Control<ControlView<Chosen>> = (node) => {
  const group = el('div', 'fhirq-choices', 'choices');
  group.setAttribute('role', node.control === 'multi-choice' ? 'group' : 'radiogroup');
  group.setAttribute('aria-labelledby', node.ids.label);
  let records: Records<Choice, null> = new Map();
  return {
    root: group,
    update(next) {
      state(group, next);
      records = patch(group, records, next.options.map((option, index) => ({ node: next, option, index })), CHOICES, null);
    },
  };
};

/** An option or a unit of a `select`, keyed by its key, which is its value. The `select` sets which are selected. */
const OPTIONS: List<ChoiceView, null> = {
  key: (option) => option.key,
  create({ key }) {
    const option = document.createElement('option');
    option.value = key;
    const label = textIn(option);
    return { root: option, update: (next) => text(label, next.label) };
  },
};

/**
 * A list or a menu (§3.5). A single list selects nothing while no option is
 * selected, and a menu its empty first option, which clears the answer.
 */
const list: Control<ControlView<Listed>> = (node, cx) => {
  const select = el('select', 'fhirq-control', 'control');
  select.id = node.ids.control;
  const menu = node.control === 'single-menu';
  if (node.control === 'multi-list') select.multiple = true;
  if (menu) {
    const empty = select.appendChild(document.createElement('option'));
    empty.value = '';
    textIn(empty).data = cx.labels.choose;
  }
  let current = node;
  on(select, {
    change() {
      if (current.control === 'multi-list') current.set(Array.from(select.selectedOptions, (option) => option.value));
      else if (select.value === '') current.clear();
      else current.set(select.value);
    },
  });
  let records: Records<ChoiceView, null> = new Map();
  return {
    root: select,
    update(next) {
      current = next;
      state(select, next);
      attr(select, 'size', menu ? null : String(Math.min(next.options.length, 8)));
      records = patch(select, records, next.options, OPTIONS, null);
      if (select.multiple) {
        next.options.forEach((option, index) => {
          const element = select.options[index];
          if (element !== undefined && element.selected !== option.selected) element.selected = option.selected;
        });
        return;
      }
      const chosen = next.options.findIndex((option) => option.selected);
      // After the menu's empty option; a list with none selected selects nothing.
      const index = menu ? chosen + 1 : chosen;
      if (select.selectedIndex !== index) select.selectedIndex = index;
    },
  };
};

type OptionKind = Exclude<Chosen | Listed, 'yes-no'>;

/**
 * An option kind's body (§3.5): a value set's status and its retry before the
 * control, while there is one, and an open choice's free text after it.
 */
function options<N extends ControlView<OptionKind>>(control: Control<N>): Body<N> {
  return (item, end, node, cx) => {
    const status = el('p', 'fhirq-options-status', 'options-status');
    const message = textIn(status);
    const retry = el('button', 'fhirq-retry', 'retry');
    retry.type = 'button';
    textIn(retry).data = cx.labels.retry;
    const { root, update } = control(node, cx);
    item.insertBefore(root, end);
    const other = el('label', 'fhirq-other', 'other');
    textIn(other).data = cx.labels.other;
    const field = el('input', 'fhirq-other-text', 'other-text', other);
    field.type = 'text';
    let current = node;
    on(retry, { click: () => current.retry() });
    on(field, { input: () => current.setOther(field.value) });
    return (next) => {
      current = next;
      show(retry, next.optionState === 'failed', item, root);
      show(status, next.optionMessage !== null, item, retry.isConnected ? retry : root);
      text(message, next.optionMessage ?? '');
      update(next, cx);
      show(other, next.other !== null, item, end);
      if (next.other !== null && field.value !== next.other) field.value = next.other;
    };
  };
}

interface Entry {
  readonly node: ControlView<EntryKind>;
  readonly text: string;
  readonly index: number;
}

/**
 * An entry kind (§3.1, §3.3, §3.4): one field, or one per entry of a
 * repeating question inside `div.fhirq-entries`. Fields are keyed by place,
 * since they are one node's answers and have no path (M7 plan D10). A field
 * shows the text as typed and hands every input over whole; the view keeps
 * text that is not a value yet, and says so (INV-P-06).
 */
function entry(tag: 'input' | 'textarea' = 'input', mode?: 'numeric' | 'decimal'): Kind<ControlView<EntryKind>> {
  const fields: List<Entry, null> = {
    key: (_, index) => String(index),
    create({ node, index }) {
      const field = el(tag, 'fhirq-control', 'control');
      if (field instanceof HTMLInputElement) field.type = 'text';
      // A numeric keyboard, never `type="number"`, which drops text that is not a number yet.
      if (mode !== undefined) field.inputMode = mode;
      if (index === 0) field.id = node.ids.control;
      if (node.entries !== null) field.setAttribute('aria-labelledby', node.ids.label);
      let current = node;
      on(field, { input: () => (current.entries === null ? current.set(field.value) : current.setAt(index, field.value)) });
      return {
        root: field,
        update(next) {
          current = next.node;
          state(field, next.node);
          // The caret survives because an equal value is never written back.
          if (field.value !== next.text) field.value = next.text;
        },
      };
    },
  };
  return {
    label: 'for',
    body(item, end, node, cx) {
      const box = node.entries === null ? item : el('div', 'fhirq-entries', 'entries', item, end);
      const unit = node.control === 'quantity' ? unitPart(item, end, node, cx) : null;
      let records: Records<Entry, null> = new Map();
      return (next) => {
        const texts = next.entries ?? [next.entry];
        records = patch(box, records, texts.map((text, index) => ({ node: next, text, index })), fields, null, box === item ? (unit?.root ?? end) : null);
        if (unit !== null && next.control === 'quantity') unit.update(next);
      };
    },
  };
}

/** The empty first option of a unit list while no unit is chosen. */
const NO_UNIT: ChoiceView = { key: '', label: '', selected: false };

/** A quantity's unit (§3.4): a list of the units the questionnaire permits, or typed when it names none. */
function unitPart(item: HTMLElement, end: Node, node: ControlView<'quantity'>, cx: Cx) {
  let current = node;
  if (node.units.length === 0) {
    const input = el('input', 'fhirq-unit', 'unit', item, end);
    input.type = 'text';
    input.setAttribute('aria-label', cx.labels.unit);
    on(input, { input: () => current.setUnit(input.value) });
    return {
      root: input,
      update(next: ControlView<'quantity'>) {
        current = next;
        if (input.value !== next.unit) input.value = next.unit;
      },
    };
  }
  const select = el('select', 'fhirq-unit', 'unit', item, end);
  select.setAttribute('aria-label', cx.labels.unit);
  on(select, { change: () => current.setUnit(select.value) });
  let options: Records<ChoiceView, null> = new Map();
  return {
    root: select,
    update(next: ControlView<'quantity'>) {
      current = next;
      const chosen = next.units.find((unit) => unit.selected);
      options = patch(select, options, chosen === undefined ? [NO_UNIT, ...next.units] : next.units, OPTIONS, null);
      const value = chosen?.key ?? '';
      if (select.value !== value) select.value = value;
    },
  };
}

/** A group's children (§3.7), item roots between its legend and its error container. */
function group(item: HTMLElement, end: Node, _: ControlView<'group'>, cx: Cx) {
  let records: Records<ViewNode, Cx> = new Map();
  return (next: ControlView<'group'>) => {
    records = patch(item, records, next.children, ITEMS, cx, end);
  };
}

/** A repeating group's instances, keyed by instance path, never by position (§3.8, T11). */
const INSTANCES: List<InstanceView, Cx> = {
  key: (instance) => instance.path,
  create(instance, cx) {
    const section = el('section', 'fhirq-instance', 'instance');
    section.setAttribute('data-path', instance.path);
    section.setAttribute('aria-labelledby', instance.ids.label);
    const heading = el(`h${Math.min(cx.level, 6)}` as 'h3' | 'h4' | 'h5' | 'h6', 'fhirq-instance-label', 'instance-label', section);
    heading.id = instance.ids.label;
    const name = textIn(heading);
    const remove = el('button', 'fhirq-remove', 'remove', section);
    remove.type = 'button';
    remove.id = instance.ids.control;
    const removeLabel = textIn(remove);
    let current = instance;
    on(remove, { click: () => current.remove() });
    // The instance's items name their own instances a level further down.
    const inner = { ...cx, level: cx.level + 1 };
    let records: Records<ViewNode, Cx> = new Map();
    return {
      root: section,
      update(next) {
        current = next;
        text(name, next.label);
        text(removeLabel, next.removeLabel);
        records = patch(section, records, next.children, ITEMS, inner, remove);
      },
    };
  },
};

/**
 * A repeating group's body (§3.8): its instances, the add control, and the
 * reason it cannot add while there is one. The add control stays focusable
 * when inert (`aria-disabled`), so the reason can be reached (INV-P-04).
 */
function repeat(item: HTMLElement, end: Node, node: ControlView<'repeating-group'>, cx: Cx) {
  const add = el('button', 'fhirq-add', 'add', item, end);
  add.type = 'button';
  add.id = node.ids.control;
  const addLabel = textIn(add);
  const reason = el('p', 'fhirq-reason', 'reason');
  reason.id = node.ids.description;
  const reasonText = textIn(reason);
  let current = node;
  on(add, { click: () => current.add() });
  let records: Records<InstanceView, Cx> = new Map();
  return (next: ControlView<'repeating-group'>) => {
    current = next;
    records = patch(item, records, next.instances, INSTANCES, cx, add);
    attr(add, 'aria-disabled', next.canAdd ? null : 'true');
    attr(add, 'aria-describedby', next.canAdd || next.reason === null ? null : next.ids.description);
    text(addLabel, next.addLabel);
    show(reason, next.reason !== null, item, end);
    text(reasonText, next.reason ?? '');
  };
}

/** A calculated value (§3.6): an `output` the label names. */
const value: Control<ControlView<'calculated'>> = (node) => {
  const output = el('output', 'fhirq-value', 'value');
  output.id = node.ids.control;
  output.setAttribute('aria-labelledby', node.ids.label);
  const content = textIn(output);
  return { root: output, update: (next) => text(content, next.display) };
};

/** A `display` item (§3.6): its text, or its rich text, in a paragraph that is its own label. */
const statement: Control<ControlView<'statement'>> = (node) => {
  const paragraph = el('p', 'fhirq-statement', 'statement');
  paragraph.id = node.ids.label;
  return { root: paragraph, update: caption(paragraph, node, true) };
};

/** A lenient-mode placeholder (§3.6, AC-01.3.2): the label and a notice, with no control. */
const unsupported: Control<ControlView<'unsupported'>> = (node) => {
  const box = el('div', 'fhirq-unsupported', 'unsupported');
  const content = caption(el('span', 'fhirq-label', 'label', box), node);
  const notice = textIn(el('p', 'fhirq-notice', 'notice', box));
  return {
    root: box,
    update(next) {
      content(next);
      text(notice, next.notice);
    },
  };
};

/** The table: each kind's root, label and body. */
const KINDS: { readonly [K in ControlKind]: Kind<ControlView<K>> } = {
  'yes-no': { body: alone(choices) },
  'short-text': entry(),
  'long-text': entry('textarea'),
  integer: entry('input', 'numeric'),
  decimal: entry('input', 'decimal'),
  'calendar-date': entry(),
  'date-time': entry(),
  quantity: entry('input', 'decimal'),
  'single-choice': { body: options<ControlView<'single-choice'>>(choices) },
  'multi-choice': { body: options<ControlView<'multi-choice'>>(choices) },
  'single-list': { label: 'for', body: options<ControlView<'single-list'>>(list) },
  'single-menu': { label: 'for', body: options<ControlView<'single-menu'>>(list) },
  'multi-list': { label: 'for', body: options<ControlView<'multi-list'>>(list) },
  calculated: { still: true, body: alone(value) },
  statement: { label: 'none', still: true, body: alone(statement) },
  unsupported: { label: 'none', still: true, body: alone(unsupported) },
  group: { stem: 'group', body: group },
  'repeating-group': { stem: 'repeat', body: repeat },
};

/**
 * A list of item roots: the form's, a group's or an instance's. Keyed by item
 * path, which each root carries as `data-path`, and by kind: a value set that
 * resolves can turn a node's radios into a list (`controlKind`), which is a
 * new root, not the old one changed in place.
 */
export const ITEMS: List<ViewNode, Cx> = {
  key: (node) => `${node.control}:${node.path}`,
  create: (node, cx) => item(KINDS[node.control] as Kind<ViewNode>, node, cx),
};
