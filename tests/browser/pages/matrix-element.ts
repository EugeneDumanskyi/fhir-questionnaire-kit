import { createSession } from '@fhirq/core';
import type { ControlKind, ControlProps } from '@fhirq/core/view';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';

import { FORMS } from './forms.js';
import { MATRIX_FORMS } from './names.js';
import type { EntryKind, OptionKind } from './tier3.js';

/**
 * The element's pages of M8's axe matrix (plan D4): the form the element
 * names, in the tier it names. Tier 2 is the page's stylesheets, so only tier
 * 3 is drawn here: an accessible override of every answerable kind, as
 * custom elements in the kit's shadow root (`08-dom-contract.md` §3.9). They
 * mirror `tier3.tsx`: a text field, with a unit menu for a quantity that
 * names its units, or a native `select`.
 */

type Props<K extends ControlKind> = ControlProps<K>;

/** ADR-0013's duties, on the control's field. */
function duties(field: HTMLElement, { node, ids }: Props<EntryKind | OptionKind>): void {
  field.id = ids.control;
  field.setAttribute('aria-invalid', String(node.invalid));
  if (node.invalid) field.setAttribute('aria-describedby', ids.error);
  else field.removeAttribute('aria-describedby');
}

/** Replaces a `select`'s options with these, selecting those that are. */
function fill(select: HTMLSelectElement, options: readonly { readonly key: string; readonly label: string; readonly selected: boolean }[], empty: string | null): void {
  const made = options.map(({ key, label, selected }) => Object.assign(document.createElement('option'), { value: key, text: label, selected }));
  if (empty !== null) made.unshift(Object.assign(document.createElement('option'), { value: '', text: empty, selected: !options.some((option) => option.selected) }));
  select.replaceChildren(...made);
}

class EntryControl extends HTMLElement {
  #props: Props<EntryKind> | null = null;
  #field: HTMLInputElement | HTMLTextAreaElement | null = null;
  #unit: HTMLSelectElement | null = null;

  set props(props: Props<EntryKind>) {
    this.#props = props;
    const { node, ids } = props;
    const field = (this.#field ??= this.#make(node.control === 'long-text' ? 'textarea' : 'input'));
    duties(field, props);
    if (field.value !== node.entry) field.value = node.entry;
    if (node.control !== 'quantity' || node.units.length === 0) return;
    const unit = (this.#unit ??= this.#makeUnit());
    unit.setAttribute('aria-labelledby', ids.label);
    fill(unit, node.units, null);
  }

  #make(tag: 'input' | 'textarea'): HTMLInputElement | HTMLTextAreaElement {
    const field = document.createElement(tag);
    field.addEventListener('input', () => this.#props?.node.set(field.value));
    field.addEventListener('focusout', () => this.#props?.leave());
    this.append(field);
    return field;
  }

  #makeUnit(): HTMLSelectElement {
    const unit = document.createElement('select');
    unit.addEventListener('change', () => {
      const node = this.#props?.node;
      if (node?.control === 'quantity') node.setUnit(unit.value);
    });
    this.append(unit);
    return unit;
  }
}

class OptionControl extends HTMLElement {
  #props: Props<OptionKind> | null = null;
  readonly #select = document.createElement('select');

  constructor() {
    super();
    this.#select.addEventListener('change', () => {
      const node = this.#props?.node;
      const keys = [...this.#select.selectedOptions].map((option) => option.value).filter((key) => key !== '');
      if (node === undefined) return;
      if (node.control === 'multi-choice' || node.control === 'multi-list') node.set(keys);
      else if (keys[0] === undefined) node.clear();
      // `yes-no` and the single kinds, whose `set` takes one key.
        else (node.set as (key: string) => void)(keys[0]);
    });
    this.#select.addEventListener('focusout', () => this.#props?.leave());
  }

  set props(props: Props<OptionKind>) {
    this.#props = props;
    const multiple = props.node.control === 'multi-choice' || props.node.control === 'multi-list';
    if (!this.#select.isConnected) this.append(this.#select);
    this.#select.multiple = multiple;
    duties(this.#select, props);
    fill(this.#select, props.node.options, multiple ? null : 'Choose');
  }
}

customElements.define('matrix-entry', EntryControl);
customElements.define('matrix-options', OptionControl);

const ENTRY = 'matrix-entry';
const OPTIONS = 'matrix-options';
const CONTROLS = {
  'yes-no': OPTIONS,
  'short-text': ENTRY,
  'long-text': ENTRY,
  integer: ENTRY,
  decimal: ENTRY,
  'calendar-date': ENTRY,
  'date-time': ENTRY,
  quantity: ENTRY,
  'single-choice': OPTIONS,
  'single-list': OPTIONS,
  'single-menu': OPTIONS,
  'multi-choice': OPTIONS,
  'multi-list': OPTIONS,
} as const;

defineQuestionnaireElement();
const element = document.querySelector<FhirQuestionnaireElement>('fhir-questionnaire');
const form = MATRIX_FORMS.find((name) => name === element?.dataset['form']);
if (element !== null && form !== undefined) {
  if (element.dataset['tier'] === '3') element.controls = CONTROLS;
  const session = createSession(FORMS[form].form, FORMS[form].options);
  element.session = session;
  Object.assign(window, { fhirq: { session, ready: true } });
}
