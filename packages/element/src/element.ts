import type { Session } from '@fhirq/core';
import { createView, type View, type ViewModel } from '@fhirq/core/view';
import base from '@fhirq/themes/base.css';
import preset from '@fhirq/themes/default.css';

import { el } from './dom.js';
import { inSlice, ITEMS, summaryPart, type SliceNode } from './items.js';
import { patch, type Keyed, type Records } from './patch.js';

/** One parsed sheet per stylesheet, shared by every instance (ADR-0014). */
let sheets: CSSStyleSheet[] | undefined;

function adopt(root: ShadowRoot): void {
  sheets ??= [preset, base].map((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  });
  root.adoptedStyleSheets = sheets;
}

/**
 * `<fhir-questionnaire>`, S1 slice. Renders a host-created session into an
 * open shadow root through the keyed reconciler (`patch.ts`): one record per
 * item path, patched in place, never replaced while visible.
 *
 * @alpha S1 spike surface: M7 adds `questionnaire`, `src`, `locale` and events.
 */
export class FhirQuestionnaireElement extends HTMLElement {
  readonly #root: ShadowRoot;
  readonly #form: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #summary: (model: ViewModel) => void;
  #records: Records<SliceNode, ViewModel> = new Map();
  #session: Session | null = null;
  #view: View | null = null;
  #connection: AbortController | null = null;
  #rendered: ViewModel | null = null;
  /** Set while a model is painted: a render asked for meanwhile runs after it (`#render`). */
  #painting = false;
  #again = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    adopt(this.#root);
    this.#form = el('div', 'fhirq-form', 'form', this.#root);
    this.#status = el('div', 'fhirq-status', 'status', this.#form);
    this.#status.setAttribute('role', 'status');
    this.#summary = summaryPart(this.#form);
  }

  get session(): Session | null {
    return this.#session;
  }

  set session(session: Session | null) {
    if (session === this.#session) return;
    this.#disconnect();
    for (const record of this.#records.values()) record.root.remove();
    this.#records = new Map();
    this.#rendered = null;
    this.#session = session;
    // Ids are scoped by the shadow root, so a fixed prefix cannot collide (ADR-0014).
    // `lang` and the `locale` property are M7 (ADR-0020); the slice formats nothing.
    this.#view = session === null ? null : createView(session, { idPrefix: 'fhirq', locale: 'en' });
    if (this.isConnected) this.connectedCallback();
  }

  connectedCallback(): void {
    const view = this.#view;
    if (view === null || this.#connection !== null) return;
    const connection = new AbortController();
    this.#connection = connection;
    const { signal } = connection;
    const unsubscribe = view.subscribe(() => this.#render());
    signal.addEventListener('abort', unsubscribe);

    const root = this.#root;
    root.addEventListener('input', (event) => this.#onInput(event), { signal });
    root.addEventListener('change', (event) => this.#onChange(event), { signal });
    root.addEventListener('focusout', (event) => this.#onFocusOut(event as FocusEvent), { signal });
    root.addEventListener('click', (event) => this.#onClick(event), { signal });
    this.#render();
  }

  disconnectedCallback(): void {
    this.#disconnect();
  }

  #disconnect(): void {
    this.#connection?.abort();
    this.#connection = null;
  }

  #recordOf(target: EventTarget | null): Keyed<SliceNode, ViewModel> | undefined {
    const item = target instanceof Element ? target.closest('[data-path]') : null;
    return item === null ? undefined : this.#records.get(item.getAttribute('data-path') ?? '');
  }

  #onInput(event: Event): void {
    const node = this.#recordOf(event.target)?.view;
    if (node?.control === 'short-text' && event.target instanceof HTMLInputElement) node.set(event.target.value);
  }

  #onChange(event: Event): void {
    const node = this.#recordOf(event.target)?.view;
    if (node?.control === 'yes-no' && event.target instanceof HTMLInputElement) node.set(event.target.value);
  }

  #onFocusOut(event: FocusEvent): void {
    const record = this.#recordOf(event.target);
    const next = event.relatedTarget;
    if (record === undefined || (next instanceof Node && record.root.contains(next))) return;
    record.view.leave();
  }

  #onClick(event: Event): void {
    const link = event.target instanceof Element ? event.target.closest('.fhirq-summary-link') : null;
    const target = link?.getAttribute('href')?.slice(1);
    if (target === undefined) return;
    // A fragment link cannot reach into a shadow root, so focus is moved by id.
    event.preventDefault();
    this.#root.getElementById(target)?.focus();
  }

  /**
   * Paints the view's current model. A paint never runs inside another:
   * Chromium fires `focusout` the moment a focused control is removed, and
   * code listening for it, or a host control's own callbacks, can send a
   * command whose cycle would render mid-patch, into lists this paint has
   * half rewritten. That render runs once this paint ends, from the model
   * current by then.
   */
  #render(): void {
    if (this.#painting) {
      this.#again = true;
      return;
    }
    this.#painting = true;
    try {
      do {
        this.#again = false;
        const model = this.#view?.getSnapshot();
        if (model !== undefined) this.#paint(model);
      } while (this.#again);
    } finally {
      this.#painting = false;
    }
  }

  #paint(model: ViewModel): void {
    const previous = this.#rendered;
    if (model === previous) return;
    this.#rendered = model;
    this.#summary(model);
    // Between the summary and the status, which stays the form's last child (DOM contract §2).
    this.#records = patch(this.#form, this.#records, model.nodes.filter(inSlice), ITEMS, model, this.#status);

    const { announcement, focusTarget } = model;
    // Assigned even when the text repeats, so a second identical message is announced.
    if (announcement !== null && announcement !== previous?.announcement) this.#status.textContent = announcement.text;
    if (focusTarget !== null && focusTarget !== previous?.focusTarget) this.#root.getElementById(focusTarget.id)?.focus();
  }
}

/**
 * Registers `<fhir-questionnaire>` once.
 *
 * @alpha S1 spike surface, as the class.
 */
export function defineQuestionnaireElement(name = 'fhir-questionnaire'): void {
  if (customElements.get(name) === undefined) customElements.define(name, FhirQuestionnaireElement);
}
