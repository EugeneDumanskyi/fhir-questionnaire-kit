import { createSession, emitResponse, type OptionResolver, type Questionnaire, type QuestionnaireResponse, type Session, type SessionChange } from '@fhirq/core';
import { createView, type View, type ViewModel, type ViewNode, type ViewOptions } from '@fhirq/core/view';
import base from '@fhirq/themes/base.css';
import preset from '@fhirq/themes/default.css';

import { loadQuestionnaire, valueSetResolver } from './default-resolver.js';
import { dispatch, el, type EventName } from './dom.js';
import { ITEMS, type Cx } from './kinds.js';
import { localeOf } from './locale.js';
import { patch, type Records } from './patch.js';
import { summaryPart } from './summary.js';

/**
 * The element's events (ADR-0014 note, M7 plan D5): `CustomEvent`s on the
 * element, which bubble, each `detail` a plain object. Typed here rather than
 * by exported types (D4).
 */
declare global {
  interface HTMLElementEventMap {
    /** The response after each change to it, without `authored`: the host stamps it when it stores or sends it. */
    'fhirq-change': CustomEvent<QuestionnaireResponse>;
    /** The response once the form is completed, without `authored`. */
    'fhirq-complete': CustomEvent<QuestionnaireResponse>;
    /** The questionnaire could not be loaded or opened: what was thrown, verbatim. The form stays empty. */
    'fhirq-error': CustomEvent<{ readonly error: unknown }>;
  }
}

const EVENTS: readonly EventName[] = ['input', 'change', 'click', 'focusout'];

/** The properties a host can set before the element is defined, which the upgrade would otherwise leave shadowing the class's own. */
const PROPERTIES = ['questionnaire', 'session', 'resolver', 'locale', 'timeZone', 'messages'] as const;

/** What the element makes its next session from: a box per value, so a load for a value since replaced is known. */
type Source = { readonly questionnaire: Questionnaire } | { readonly src: string };

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
 * `<fhir-questionnaire>`. Renders a questionnaire into an open shadow root:
 * each kind as its descriptor (`kinds.ts`) builds it, kept in line by the
 * keyed reconciler (`patch.ts`), one record per item path, patched in place
 * and never replaced while visible.
 *
 * The form comes from the `questionnaire` property, the `src` attribute or a
 * host's `session`, whichever was set last (ADR-0014 note, M7 plan D6). The
 * element makes a session for the first two the first time it is connected,
 * or at once when it already is, keeps it across disconnection, and disposes
 * it when another value replaces it; a host's session is the host's to
 * dispose. Setting the same value again does nothing.
 *
 * Value sets are resolved by the `resolver` property, or else, with a
 * `value-set-base` attribute, by the default resolver's `$expand` request
 * (ADR-0012). Either is read when the element makes a session, as session
 * options are, and a session keeps the one it was made with.
 *
 * @alpha M7 builds it step by step: `controls` is still to come.
 */
export class FhirQuestionnaireElement extends HTMLElement {
  static readonly observedAttributes = ['src', 'lang'];

  readonly #root: ShadowRoot;
  readonly #form: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #summary: (model: ViewModel | null) => void;
  #records: Records<ViewNode, Cx> = new Map();
  /** The `questionnaire` property as set, until another source replaces it. */
  #questionnaire: Questionnaire | null = null;
  /** What the next session is made from, until it has been made or has failed. */
  #source: Source | null = null;
  #session: Session | null = null;
  /** The element made `#session`, so disposes it once replaced. */
  #owned = false;
  #resolver: OptionResolver | null = null;
  #locale: string | null = null;
  #timeZone: string | null = null;
  #messages: NonNullable<ViewOptions['messages']> | null = null;
  #view: View | null = null;
  /** What `#view` was built from: its session, locale, time zone and messages. */
  #built: readonly unknown[] = [];
  /** Stops listening to the view and the session: set while connected with a view. */
  #unwatch: (() => void) | null = null;
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

  /** A FHIR R4 `Questionnaire` for the element to make its session from. */
  get questionnaire(): Questionnaire | null {
    return this.#questionnaire;
  }

  set questionnaire(questionnaire: Questionnaire | null) {
    if (questionnaire === this.#questionnaire) return;
    this.#replace(questionnaire === null ? null : { questionnaire });
    this.#questionnaire = questionnaire;
  }

  /** The session the form shows: the host's, or the one the element made. A host that needs session options sets its own. */
  get session(): Session | null {
    return this.#session;
  }

  set session(session: Session | null) {
    if (session === this.#session) return;
    this.#replace(null);
    this.#session = session;
    this.#look();
  }

  /**
   * Resolves the value sets the questionnaire references, in place of the
   * default resolver (ADR-0012). Read when the element makes a session, so
   * set it before `questionnaire`, or before `src` has loaded. A host's own
   * `session` keeps its own.
   */
  get resolver(): OptionResolver | null {
    return this.#resolver;
  }

  set resolver(resolver: OptionResolver | null) {
    this.#resolver = resolver;
  }

  /** A BCP 47 tag. Without one, the `lang` of the element or its nearest ancestor, then the browser's language, then `"en"`. */
  get locale(): string | null {
    return this.#locale;
  }

  set locale(locale: string | null) {
    this.#locale = locale;
    this.#look();
  }

  /** An IANA zone to read and show `dateTime` answers in. Without one, a time of day needs its offset written. */
  get timeZone(): string | null {
    return this.#timeZone;
  }

  set timeZone(timeZone: string | null) {
    this.#timeZone = timeZone;
    this.#look();
  }

  /** Catalogue overrides, merged key by key over the built-in `en` text. */
  get messages(): NonNullable<ViewOptions['messages']> | null {
    return this.#messages;
  }

  set messages(messages: NonNullable<ViewOptions['messages']> | null) {
    this.#messages = messages;
    this.#look();
  }

  /** Asks the session to complete (ADR-0014 note, M7 plan D2): `fhirq-complete` follows, or the error summary shows why not. */
  requestCompletion(): void {
    this.#session?.dispatch({ type: 'RequestCompletion' });
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (value === old) return;
    if (name === 'lang') this.#look();
    else this.#replace(value === null ? null : { src: value });
  }

  connectedCallback(): void {
    if (this.#connection !== null) return;
    for (const name of PROPERTIES) {
      if (!Object.hasOwn(this, name)) continue;
      const value: unknown = Reflect.get(this, name);
      Reflect.deleteProperty(this, name);
      Reflect.set(this, name, value);
    }
    const connection = new AbortController();
    this.#connection = connection;
    // One listener per event for the whole tree: each part's handlers are found from the target (`dom.ts`).
    // An event the patch sets off is not the respondent's: Chromium fires `focusout` from a focused
    // control the patch removes, such as a remove control, and focus has not left its group.
    const listener = (event: Event) => {
      if (!this.#patching) dispatch(event);
    };
    for (const type of EVENTS) this.#root.addEventListener(type, listener, { signal: connection.signal });
    this.#look();
    this.#watch();
    this.#open();
  }

  disconnectedCallback(): void {
    this.#connection?.abort();
    this.#connection = null;
    this.#unwatch?.();
    this.#unwatch = null;
  }

  /** Drops the session, disposing it if the element made it, and takes `source` for the next: made now if connected, else on connect. */
  #replace(source: Source | null): void {
    const owned = this.#owned ? this.#session : null;
    this.#owned = false;
    this.#session = null;
    this.#questionnaire = null;
    this.#source = source;
    // The form comes down, and stops listening, before the session it showed is disposed.
    this.#look();
    owned?.dispose();
    this.#open();
  }

  /** Makes the session from `#source`, when connected: a questionnaire at once, `src` once loaded with the connection's signal. */
  #open(): void {
    const source = this.#source;
    const signal = this.#connection?.signal;
    if (source === null || signal === undefined) return;
    if ('questionnaire' in source) {
      this.#make(source.questionnaire);
      return;
    }
    // Disconnecting aborts the load, and the next connection starts it again.
    void loadQuestionnaire(source.src, signal).then(
      (questionnaire) => {
        if (this.#source === source) this.#make(questionnaire);
      },
      (error: unknown) => {
        if (this.#source === source && !signal.aborted) this.#fail(error);
      },
    );
  }

  #make(questionnaire: Questionnaire): void {
    this.#source = null;
    let session: Session;
    try {
      session = createSession(questionnaire, this.#options());
    } catch (error) {
      this.#fail(error);
      return;
    }
    this.#session = session;
    this.#owned = true;
    this.#look();
  }

  /** The resolver a session made now takes: the property's, else the default's with `value-set-base`, else none. */
  #options(): { resolver?: OptionResolver } {
    const base = this.getAttribute('value-set-base');
    const resolver = this.#resolver ?? (base === null ? null : valueSetResolver(base));
    return resolver === null ? {} : { resolver };
  }

  /** The questionnaire could not be had: the form stays empty until another source is set. */
  #fail(error: unknown): void {
    this.#source = null;
    this.#fire('fhirq-error', { error });
  }

  #fire<K extends 'fhirq-change' | 'fhirq-complete' | 'fhirq-error'>(type: K, detail: HTMLElementEventMap[K]['detail']): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  /**
   * Builds the view the session, locale, time zone and messages call for,
   * unless it is the one there. The locale is read from the tree, so a view
   * is built only while connected. A new view starts the rendered form again:
   * its records, the summary and the status region, and typed drafts go with
   * the old view (M7 plan D6).
   */
  #look(): void {
    const session = this.#session;
    if (session !== null && this.#connection === null) return;
    const locale = session === null ? '' : localeOf(this.#locale, this);
    const built = session === null ? [] : [session, locale, this.#timeZone, this.#messages];
    if (built.length === this.#built.length && built.every((value, index) => value === this.#built[index])) return;
    this.#built = built;
    this.#unwatch?.();
    this.#unwatch = null;
    for (const record of this.#records.values()) record.root.remove();
    this.#records = new Map();
    this.#rendered = null;
    this.#summary(null);
    this.#status.textContent = '';
    this.#view =
      session === null
        ? null
        : createView(session, {
            // Ids are scoped by the shadow root, so a fixed prefix cannot collide (ADR-0014).
            idPrefix: 'fhirq',
            locale,
            ...(this.#timeZone === null ? {} : { timeZone: this.#timeZone }),
            ...(this.#messages === null ? {} : { messages: this.#messages }),
          });
    this.#watch();
  }

  /** Listens to the view, to paint, and to the session, for its events: while connected, and once. */
  #watch(): void {
    const view = this.#view;
    const session = this.#session;
    if (view === null || session === null || this.#connection === null || this.#unwatch !== null) return;
    const stops = [view.subscribe(() => this.#render()), session.subscribe((change) => this.#emit(session, change))];
    this.#unwatch = () => {
      for (const stop of stops) stop();
    };
    this.#render();
  }

  #emit(session: Session, change: SessionChange): void {
    const completed = change.completion === 'completed';
    if (!change.responseChanged && !completed) return;
    const { authored, ...response } = emitResponse(session);
    void authored;
    if (change.responseChanged) this.#fire('fhirq-change', response);
    if (completed) this.#fire('fhirq-complete', response);
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
      this.#records = patch(this.#form, this.#records, model.nodes, ITEMS, cx, this.#status);
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
 * @alpha As the class.
 */
export function defineQuestionnaireElement(name = 'fhir-questionnaire'): void {
  if (customElements.get(name) === undefined) customElements.define(name, FhirQuestionnaireElement);
}
