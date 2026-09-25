import type { Session } from '@fhirq/core';
import { createView, type ControlView, type View, type ViewModel } from '@fhirq/core/view';
import base from '@fhirq/themes/base.css';
import preset from '@fhirq/themes/default.css';

import { dispatch, el, type EventName } from './dom.js';
import { covered, ITEMS, type Covered, type Cx } from './kinds.js';
import { patch, type Records } from './patch.js';
import { summaryPart } from './summary.js';

const EVENTS: readonly EventName[] = ['input', 'change', 'click', 'focusout'];

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
 * `<fhir-questionnaire>`. Renders a host-created session into an open shadow
 * root: each kind as its descriptor (`kinds.ts`) builds it, kept in line by
 * the keyed reconciler (`patch.ts`), one record per item path, patched in
 * place and never replaced while visible.
 *
 * @alpha S1 spike surface: M7 adds `questionnaire`, `src`, `locale` and events.
 */
export class FhirQuestionnaireElement extends HTMLElement {
  readonly #root: ShadowRoot;
  readonly #form: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #summary: (model: ViewModel) => void;
  #records: Records<ControlView<Covered>, Cx> = new Map();
  #session: Session | null = null;
  #view: View | null = null;
  #connection: AbortController | null = null;
  #rendered: ViewModel | null = null;
  /** Set while a model is painted: a render asked for meanwhile runs after it (`#render`). */
  #painting = false;
  #again = false;
  /** Set while the lists are patched, before focus moves: the events that sets off are ignored. */
  #patching = false;

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
    // `lang` and the `locale` property are M7 plan step 5 (ADR-0020).
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

    // One listener per event for the whole tree: each part's handlers are found from the target (`dom.ts`).
    // An event the patch sets off is not the respondent's: Chromium fires `focusout` from a focused
    // control the patch removes, such as a remove control, and focus has not left its group.
    const listener = (event: Event) => {
      if (!this.#patching) dispatch(event);
    };
    for (const type of EVENTS) this.#root.addEventListener(type, listener, { signal });
    this.#render();
  }

  disconnectedCallback(): void {
    this.#disconnect();
  }

  #disconnect(): void {
    this.#connection?.abort();
    this.#connection = null;
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
    this.#patching = true;
    try {
      this.#summary(model);
      // Between the summary and the status, which stays the form's last child (DOM contract §2).
      const cx = { marker: model.requiredMarker, labels: model.labels, level: 3 };
      this.#records = patch(this.#form, this.#records, model.nodes.filter(covered), ITEMS, cx, this.#status);
    } finally {
      this.#patching = false;
    }

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
