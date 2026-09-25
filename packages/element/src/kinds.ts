import type { ChoiceView, ControlView, InstanceView, ViewIssue, ViewModel, ViewNode } from '@fhirq/core/view';

import { attr, el, on, show, text, textIn } from './dom.js';
import { patch, type List, type Part, type Records } from './patch.js';

/**
 * The control kinds as descriptors, one per kind, which one item builder
 * interprets and the one reconciler keeps in line (ADR-0021 rung 2, M7 plan
 * step 3b). Markup follows docs/08-dom-contract.md §3.
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

/** The kinds built so far. The option and read-only kinds are M7 plan step 4. */
export type Covered = 'yes-no' | EntryKind | 'group' | 'repeating-group';

/** A kind's body: its parts between the label and the error container, built into `item` before `end`, and how they follow a node. */
type Body<N extends ViewNode> = (item: HTMLElement, end: Node, node: N, cx: Cx) => (node: N) => void;

interface Kind<N extends ViewNode> {
  /** A `fieldset` root's stem (§3.7, §3.8), which joins `item` in its class and part; its label is a `legend`. A `div` root has none. */
  readonly stem?: 'group' | 'repeat';
  /** A `div` root's label is a `label` for its one control, or else a `span` that names a group of controls. */
  readonly labels?: true;
  readonly body: Body<N>;
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
  const { stem, labels } = kind;
  const root = el(stem === undefined ? 'div' : 'fieldset', 'fhirq-item', 'item');
  root.setAttribute('data-path', node.path);
  const label = el(stem === undefined ? (labels ? 'label' : 'span') : 'legend', 'fhirq-label', 'label', root);
  label.id = node.ids.label;
  if (labels) label.setAttribute('for', node.ids.control);
  if (stem !== undefined) {
    root.classList.add(`fhirq-${stem}`);
    root.part.add(stem);
    // A summary link may move focus to a group's legend.
    label.tabIndex = -1;
  }
  const content = textIn(label);
  const marker = el('span', 'fhirq-required', 'required');
  marker.setAttribute('aria-hidden', 'true');
  textIn(marker).data = cx.marker;
  const error = el('div', 'fhirq-error', 'error', root);
  error.id = node.ids.error;
  const body = kind.body(root, error, node, cx);
  let issues: Records<ViewIssue, null> = new Map();
  let current = node;
  on(root, {
    focusout(event) {
      const next = (event as FocusEvent).relatedTarget;
      if (!(next instanceof Node && root.contains(next))) current.leave();
    },
  });
  return {
    root,
    update(next) {
      current = next;
      text(content, next.label);
      show(marker, next.required, label, null);
      if (stem !== undefined) attr(root, 'aria-describedby', next.invalid ? next.ids.error : null);
      body(next);
      attr(error, 'hidden', next.invalid ? null : '');
      issues = patch(error, issues, next.issues, ISSUES, null);
    },
  };
}

interface Choice {
  readonly node: ControlView<'yes-no'>;
  readonly option: ChoiceView;
  readonly index: number;
}

/** A radio per option, keyed by the option's key, which is its value (§3.2). */
const RADIOS: List<Choice, null> = {
  key: ({ option }) => option.key,
  create({ node, option }) {
    const choice = el('label', 'fhirq-choice', 'choice');
    const radio = el('input', 'fhirq-radio', 'radio', choice);
    radio.type = 'radio';
    radio.value = option.key;
    // Same-name native radios give the roving tab stop and arrow keys (NFR-A-07).
    radio.name = node.ids.control;
    const caption = textIn(el('span', 'fhirq-choice-label', 'choice-label', choice));
    let current = node;
    on(radio, { change: () => current.set(option.key) });
    return {
      root: choice,
      update(next) {
        current = next.node;
        // On the first choice: the focusable element a summary link reaches.
        attr(radio, 'id', next.index === 0 ? next.node.ids.control : null);
        if (radio.checked !== next.option.selected) radio.checked = next.option.selected;
        text(caption, next.option.label);
      },
    };
  },
};

function choices(item: HTMLElement, end: Node, node: ControlView<'yes-no'>) {
  const group = el('div', 'fhirq-choices', 'choices', item, end);
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', node.ids.label);
  let radios: Records<Choice, null> = new Map();
  return (next: ControlView<'yes-no'>) => {
    state(group, next);
    radios = patch(group, radios, next.options.map((option, index) => ({ node: next, option, index })), RADIOS, null);
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
    labels: true,
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

/** A permitted unit, keyed by its key, which is its value. */
const UNITS: List<ChoiceView, null> = {
  key: (unit) => unit.key,
  create({ key }) {
    const option = document.createElement('option');
    option.value = key;
    const label = textIn(option);
    return { root: option, update: (unit) => text(label, unit.label) };
  },
};

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
      options = patch(select, options, chosen === undefined ? [NO_UNIT, ...next.units] : next.units, UNITS, null);
      const value = chosen?.key ?? '';
      if (select.value !== value) select.value = value;
    },
  };
}

/** A group's children (§3.7), item roots between its legend and its error container. */
function group(item: HTMLElement, end: Node, _: ControlView<'group'>, cx: Cx) {
  let records: Records<ControlView<Covered>, Cx> = new Map();
  return (next: ControlView<'group'>) => {
    records = patch(item, records, next.children.filter(covered), ITEMS, cx, end);
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
    let records: Records<ControlView<Covered>, Cx> = new Map();
    return {
      root: section,
      update(next) {
        current = next;
        text(name, next.label);
        text(removeLabel, next.removeLabel);
        records = patch(section, records, next.children.filter(covered), ITEMS, inner, remove);
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

/** The table: each kind's root, label and body. */
const KINDS: { readonly [K in Covered]: Kind<ControlView<K>> } = {
  'yes-no': { body: choices },
  'short-text': entry(),
  'long-text': entry('textarea'),
  integer: entry('input', 'numeric'),
  decimal: entry('input', 'decimal'),
  'calendar-date': entry(),
  'date-time': entry(),
  quantity: entry('input', 'decimal'),
  group: { stem: 'group', body: group },
  'repeating-group': { stem: 'repeat', body: repeat },
};

/** Whether the element builds `node`'s kind yet. */
export const covered = (node: ViewNode): node is ControlView<Covered> => node.control in KINDS;

/** A list of item roots, keyed by item path, which each root carries as `data-path`: the form's, a group's or an instance's. */
export const ITEMS: List<ControlView<Covered>, Cx> = {
  key: (node) => node.path,
  create: (node, cx) => item(KINDS[node.control] as Kind<ViewNode>, node, cx),
};
