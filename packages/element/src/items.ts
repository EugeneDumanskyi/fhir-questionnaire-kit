import type { ErrorSummary, ShortTextViewNode, ViewModel, ViewNode, YesNoViewNode } from '@fhirq/core/view';

import { attr, el, text } from './dom.js';

/**
 * One item's DOM, created once per item path and patched in place for as
 * long as the path is visible. Markup follows docs/08-dom-contract.md.
 */
export interface ItemRecord {
  node: ViewNode;
  readonly root: HTMLElement;
  update(node: ViewNode, marker: string): void;
}

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

/** The error container is always present, hidden when there is nothing to say. */
function errorPart(parent: HTMLElement) {
  const error = el('div', 'fhirq-error', 'error', parent);
  let shown: ViewNode['issues'] | undefined;
  return (node: ViewNode) => {
    attr(error, 'id', node.ids.error);
    attr(error, 'hidden', node.invalid ? null : '');
    if (node.issues === shown) return;
    shown = node.issues;
    // Never focused, so rebuilding its children cannot disturb focus or caret.
    error.replaceChildren(
      ...node.issues.map((issue) => {
        const message = el('p', 'fhirq-error-message', 'error-message');
        message.textContent = issue.message;
        return message;
      }),
    );
  };
}

/** The ARIA state every control carries, from the node's semantic fields. */
function controlState(control: HTMLElement, node: ViewNode): void {
  attr(control, 'aria-required', String(node.required));
  attr(control, 'aria-invalid', String(node.invalid));
  attr(control, 'aria-describedby', node.invalid ? node.ids.error : null);
}

function shortText(node: ShortTextViewNode): ItemRecord {
  const root = el('div', 'fhirq-item', 'item');
  const label = el('label', 'fhirq-label', 'label', root);
  const updateLabel = labelParts(label);
  const input = el('input', 'fhirq-control', 'control', root);
  input.type = 'text';
  const updateError = errorPart(root);

  const record: ItemRecord = {
    node,
    root,
    update(next, marker) {
      const current = next as ShortTextViewNode;
      record.node = current;
      attr(root, 'data-path', current.path);
      attr(label, 'id', current.ids.label);
      attr(label, 'for', current.ids.control);
      updateLabel(current, marker);
      attr(input, 'id', current.ids.control);
      controlState(input, current);
      // The caret survives because an equal value is never written back.
      if (input.value !== current.value) input.value = current.value;
      updateError(current);
    },
  };
  return record;
}

function yesNo(node: YesNoViewNode): ItemRecord {
  const root = el('div', 'fhirq-item', 'item');
  const label = el('span', 'fhirq-label', 'label', root);
  const updateLabel = labelParts(label);
  const group = el('div', 'fhirq-choices', 'choices', root);
  group.setAttribute('role', 'radiogroup');
  const radios = node.choices.map((choice) => {
    const wrapper = el('label', 'fhirq-choice', 'choice', group);
    const radio = el('input', 'fhirq-radio', 'radio', wrapper);
    radio.type = 'radio';
    radio.value = String(choice.value);
    const caption = el('span', 'fhirq-choice-label', 'choice-label', wrapper);
    return { radio, caption: caption.appendChild(document.createTextNode('')) };
  });
  const updateError = errorPart(root);

  const record: ItemRecord = {
    node,
    root,
    update(next, marker) {
      const current = next as YesNoViewNode;
      record.node = current;
      attr(root, 'data-path', current.path);
      attr(label, 'id', current.ids.label);
      updateLabel(current, marker);
      attr(group, 'aria-labelledby', current.ids.label);
      controlState(group, current);
      current.choices.forEach((choice, index) => {
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
  return record;
}

export function createItem(node: ViewNode, marker: string): ItemRecord {
  const record = node.control === 'yes-no' ? yesNo(node) : shortText(node);
  record.update(node, marker);
  return record;
}

/** The error summary. The section is kept while shown, so focus on it survives a cycle. */
export function summaryPart(form: HTMLElement) {
  const section = el('section', 'fhirq-summary', 'error-summary');
  section.tabIndex = -1;
  let shown: ErrorSummary | null = null;
  return (model: ViewModel) => {
    const summary = model.errorSummary;
    if (summary === null) {
      section.remove();
      shown = null;
      return;
    }
    if (!section.isConnected) form.prepend(section);
    if (summary === shown) return;
    shown = summary;
    attr(section, 'id', summary.id);
    attr(section, 'aria-labelledby', summary.headingId);
    const heading = el('h2', 'fhirq-summary-heading', 'error-summary-heading');
    heading.id = summary.headingId;
    heading.textContent = summary.heading;
    const list = el('ul', 'fhirq-summary-list', 'error-summary-list');
    for (const entry of summary.entries) {
      const link = el('a', 'fhirq-summary-link', 'error-summary-link', el('li', 'fhirq-summary-entry', 'error-summary-entry', list));
      link.href = `#${entry.target}`;
      link.textContent = entry.message;
    }
    section.replaceChildren(heading, list);
  };
}
