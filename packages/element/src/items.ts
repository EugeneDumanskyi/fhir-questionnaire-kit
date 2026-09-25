import type { ControlView, ErrorSummary, ViewIssue, ViewModel, ViewNode } from '@fhirq/core/view';

import { attr, el, text } from './dom.js';
import { patch, type List, type Part, type Records } from './patch.js';

/** The two control kinds the S1 slice renders; the rest are M7 (M5 plan D14). */
export type SliceNode = ControlView<'yes-no'> | ControlView<'short-text'>;
export const inSlice = (node: ViewNode): node is SliceNode => node.control === 'yes-no' || node.control === 'short-text';

/** Label text plus the required marker, which is visual only. */
function labelParts(label: HTMLElement) {
  const content = label.appendChild(document.createTextNode(''));
  const marker = el('span', 'fhirq-required', 'required');
  marker.setAttribute('aria-hidden', 'true');
  const markerText = marker.appendChild(document.createTextNode(''));
  return (node: ViewNode, markerValue: string) => {
    text(content, node.label);
    text(markerText, markerValue);
    if (node.required !== marker.isConnected) {
      if (node.required) label.appendChild(marker);
      else marker.remove();
    }
  };
}

/** An item's issues, by position: an issue has no identity of its own, and two may share a rule. */
const ISSUES: List<ViewIssue, null> = {
  key: (_, index) => String(index),
  create() {
    const message = el('p', 'fhirq-error-message', 'error-message');
    const content = message.appendChild(document.createTextNode(''));
    return { root: message, update: (issue) => text(content, issue.message) };
  },
};

/** The error container is always present, hidden when there is nothing to say. */
function errorPart(parent: HTMLElement) {
  const error = el('div', 'fhirq-error', 'error', parent);
  let issues: Records<ViewIssue, null> = new Map();
  return (node: ViewNode) => {
    attr(error, 'id', node.ids.error);
    attr(error, 'hidden', node.invalid ? null : '');
    issues = patch(error, issues, node.issues, ISSUES, null);
  };
}

/** The ARIA state every control carries, from the node's semantic fields. */
function controlState(control: HTMLElement, node: ViewNode): void {
  attr(control, 'aria-required', String(node.required));
  attr(control, 'aria-invalid', String(node.invalid));
  attr(control, 'aria-describedby', node.invalid ? node.ids.error : null);
}

function shortText(): Part<SliceNode, ViewModel> {
  const root = el('div', 'fhirq-item', 'item');
  const label = el('label', 'fhirq-label', 'label', root);
  const updateLabel = labelParts(label);
  const input = el('input', 'fhirq-control', 'control', root);
  input.type = 'text';
  const updateError = errorPart(root);

  return {
    root,
    update(next, model) {
      const current = next as ControlView<'short-text'>;
      attr(root, 'data-path', current.path);
      attr(label, 'id', current.ids.label);
      attr(label, 'for', current.ids.control);
      updateLabel(current, model.requiredMarker);
      attr(input, 'id', current.ids.control);
      controlState(input, current);
      // The caret survives because an equal value is never written back.
      if (input.value !== current.entry) input.value = current.entry;
      updateError(current);
    },
  };
}

function yesNo(node: ControlView<'yes-no'>): Part<SliceNode, ViewModel> {
  const root = el('div', 'fhirq-item', 'item');
  const label = el('span', 'fhirq-label', 'label', root);
  const updateLabel = labelParts(label);
  const group = el('div', 'fhirq-choices', 'choices', root);
  group.setAttribute('role', 'radiogroup');
  const radios = node.options.map((choice) => {
    const wrapper = el('label', 'fhirq-choice', 'choice', group);
    const radio = el('input', 'fhirq-radio', 'radio', wrapper);
    radio.type = 'radio';
    radio.value = choice.key;
    const caption = el('span', 'fhirq-choice-label', 'choice-label', wrapper);
    return { radio, caption: caption.appendChild(document.createTextNode('')) };
  });
  const updateError = errorPart(root);

  return {
    root,
    update(next, model) {
      const current = next as ControlView<'yes-no'>;
      attr(root, 'data-path', current.path);
      attr(label, 'id', current.ids.label);
      updateLabel(current, model.requiredMarker);
      attr(group, 'aria-labelledby', current.ids.label);
      controlState(group, current);
      current.options.forEach((choice, index) => {
        const parts = radios[index];
        if (parts === undefined) return;
        // Same-name native radios give the roving tab stop and arrow keys (NFR-A-07).
        attr(parts.radio, 'name', current.ids.control);
        attr(parts.radio, 'id', index === 0 ? current.ids.control : null);
        if (parts.radio.checked !== choice.selected) parts.radio.checked = choice.selected;
        text(parts.caption, choice.label);
      });
      updateError(current);
    },
  };
}

/**
 * The form's items, keyed by item path, which each root carries as
 * `data-path`. Markup follows docs/08-dom-contract.md §3.1 and §3.2.
 */
export const ITEMS: List<SliceNode, ViewModel> = {
  key: (node) => node.path,
  create: (node) => (node.control === 'yes-no' ? yesNo(node) : shortText()),
};

type SummaryEntry = ErrorSummary['entries'][number];

/**
 * The summary's entries, keyed by what they link to, so an item's entry keeps
 * its link while entries before it come and go. A form-level issue has no
 * item to link to: its entry is text alone (DOM contract §2), keyed `''`.
 */
const ENTRIES: List<SummaryEntry, null> = {
  key: (entry) => entry.focusId ?? '',
  create(entry) {
    const item = el('li', 'fhirq-summary-entry', 'summary-entry');
    const link = entry.focusId === null ? null : el('a', 'fhirq-summary-link', 'summary-link', item);
    const message = (link ?? item).appendChild(document.createTextNode(''));
    return {
      root: item,
      update(next) {
        if (link !== null) attr(link, 'href', `#${next.focusId ?? ''}`);
        text(message, next.message);
      },
    };
  },
};

/** The error summary. Its section, heading and list are kept while it shows, so focus on any of them survives a cycle. */
export function summaryPart(form: HTMLElement) {
  const section = el('section', 'fhirq-summary', 'summary');
  section.tabIndex = -1;
  const heading = el('h2', 'fhirq-summary-heading', 'summary-heading', section);
  const title = heading.appendChild(document.createTextNode(''));
  const list = el('ul', 'fhirq-summary-list', 'summary-list', section);
  let entries: Records<SummaryEntry, null> = new Map();
  return (model: ViewModel) => {
    const summary = model.errorSummary;
    if (summary === null) {
      section.remove();
      return;
    }
    if (section.parentNode !== form) form.prepend(section);
    attr(section, 'id', summary.id);
    attr(section, 'aria-labelledby', summary.headingId);
    attr(heading, 'id', summary.headingId);
    text(title, summary.heading);
    entries = patch(list, entries, summary.entries, ENTRIES, null);
  };
}
