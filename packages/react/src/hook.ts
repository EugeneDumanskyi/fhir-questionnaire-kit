import {
  createSession,
  emitResponse,
  type Diagnostic,
  type OptionResolver,
  type Questionnaire,
  type QuestionnaireResponse,
  type Session,
  type SessionOptions,
} from '@fhirq/core';
import { hydrateSession } from '@fhirq/core/resume';
import { createView, type ViewModel, type ViewOptions } from '@fhirq/core/view';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { echoes } from './echo.js';
import { report } from './report.js';

/**
 * A session the hook created, and so owns (ADR-0015): its resolver is gated
 * until a mount effect opens it, and it is disposed once nothing mounted
 * holds it.
 */
interface Owned {
  readonly session: Session;
  /**
   * It replaced a session because the host's `value` was not an echo, so its
   * mount raises `controlled-value-replaced`. Only a first session mounts
   * twice under StrictMode, and a first session replaced nothing.
   */
  readonly replaced: boolean;
  /** A mount effect holds the session, which opens the resolver gate. */
  readonly hold: () => void;
  /** An effect cleanup lets go. The session is disposed a microtask later unless a mount holds it again. */
  readonly letGo: () => void;
}

/** The hook's memory across renders: one object per component, never replaced. */
interface Box {
  owned: Owned | null;
  /** The questionnaire the first session came from, read once (M6 plan D8), and every replacement's too. */
  questionnaire: Questionnaire | null;
  /** The `value` last read from props, so each new one is compared once. */
  seen: QuestionnaireResponse | undefined;
  /** The response last emitted, or the one the session was hydrated from: what an echo matches. */
  last: QuestionnaireResponse | undefined;
}

const isSession = (source: Questionnaire | Session): source is Session => typeof (source as Partial<Session>).dispatch === 'function';

const REPLACED: Diagnostic = { code: 'controlled-value-replaced', severity: 'warning', path: null, detail: null, related: [] };

/**
 * Creates a component-owned session, from a response when there is one.
 * Core calls the resolver as the session starts, which is during render
 * here, on the server too, and twice under StrictMode. So core gets a wrapper
 * whose call waits for the gate, and the host's resolver runs only once a
 * mount effect has opened it, and never for a session that was aborted first
 * (ADR-0015 amendment note, M6 plan D3).
 *
 * Disposal waits a microtask: StrictMode runs a mount's cleanup and its
 * effect again in one pass, and the session must survive that; a real
 * unmount leaves nothing holding it.
 */
function own(questionnaire: Questionnaire, response: QuestionnaireResponse | undefined, options: SessionOptions = {}, replaced = false): Owned {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const { resolver } = options;
  const gated: OptionResolver | undefined =
    resolver === undefined ? undefined : (valueSet, context) => opened.then(() => (context.signal.aborted ? [] : resolver(valueSet, context)));
  const settings = { ...options, ...(gated === undefined ? {} : { resolver: gated }) };
  const session = response === undefined ? createSession(questionnaire, settings) : hydrateSession(questionnaire, response, settings);
  let holders = 0;
  return {
    session,
    replaced,
    hold: () => {
      holders += 1;
      open();
    },
    letGo: () => {
      holders -= 1;
      queueMicrotask(() => {
        if (holders === 0) session.dispose();
      });
    },
  };
}

/**
 * The headless tier (ADR-0013 tier 4, ADR-0015). Given a questionnaire, it
 * creates a session and owns it for the component's life: `questionnaire` and
 * `options` are read once (ADR-0001), so another questionnaire needs a new
 * component, by `key`. Given a session, it renders that one and leaves it to
 * the host, who disposes it.
 *
 * With a questionnaire, `value` controls the form by response (ADR-0015,
 * AC-08.1.2–4). The first one is hydrated. A later one that echoes the
 * response last emitted, as the same object or an equal copy, is ignored.
 * Any other replaces the session with one hydrated from it and raises
 * `controlled-value-replaced`: retained answers and error display state
 * start again. A host that edits responses outside the form passes a
 * session instead.
 *
 * It returns the session and the view model, read through
 * `useSyncExternalStore` with the same snapshot on server and client. Ids are
 * prefixed by `useId`, and `locale` is `"en"` unless given: never sniffed, so
 * server and client agree (ADR-0020). A new `locale`, `timeZone` or
 * `messages` content builds a new view, which starts without typed drafts.
 *
 * @alpha
 */
export function useQuestionnaire(
  source: Questionnaire | Session,
  options: {
    /** A BCP 47 tag. Default `"en"`. */
    readonly locale?: string | undefined;
    /** An IANA zone to read and show `dateTime` answers in. Default: none, so a time needs its offset written. */
    readonly timeZone?: string | undefined;
    /** Catalogue overrides, merged key by key over the built-in `en` text. */
    readonly messages?: ViewOptions['messages'] | undefined;
    /** Session options for a session the hook creates; ignored with a session. */
    readonly options?: SessionOptions | undefined;
    /** The response the form shows, for a session the hook creates; ignored with a session. */
    readonly value?: QuestionnaireResponse | undefined;
    /** Called with the response, without `authored`, after each change to it. */
    readonly onChange?: ((response: QuestionnaireResponse) => void) | undefined;
    /** Called with the response, without `authored`, once the form is completed. */
    readonly onComplete?: ((response: QuestionnaireResponse) => void) | undefined;
    /** Called with each diagnostic the adapter raises itself: `controlled-value-replaced`. */
    readonly onDiagnostic?: ((diagnostic: Diagnostic) => void) | undefined;
  } = {},
): { readonly session: Session; readonly view: ViewModel } {
  const { locale = 'en', timeZone, messages, value, onChange, onComplete, onDiagnostic } = options;
  // One box per component. A session is created in it the first time a render
  // has a questionnaire; a StrictMode render that is discarded discards its box.
  const [box] = useState<Box>(() => ({ owned: null, questionnaire: null, seen: value, last: value }));
  if (!isSession(source)) {
    if (box.questionnaire === null || box.owned === null) {
      box.questionnaire = source;
      box.owned = own(source, value, options.options);
    } else if (value !== box.seen) {
      // A new value is compared once. Replacing is idempotent for it, so a
      // render React discards leaves a box the next render agrees with.
      box.seen = value;
      if (value !== undefined && !echoes(value, box.last)) {
        box.last = value;
        box.owned = own(box.questionnaire, value, options.options, true);
      }
    }
  }
  const owned = isSession(source) ? null : box.owned;
  const session = owned === null ? (source as Session) : owned.session;

  const handlers = useRef({ onChange, onComplete, onDiagnostic });
  useEffect(() => {
    handlers.current = { onChange, onComplete, onDiagnostic };
  });

  useEffect(() => {
    if (owned === null) return undefined;
    owned.hold();
    if (owned.replaced) report(REPLACED, handlers.current.onDiagnostic);
    return owned.letGo;
  }, [owned]);

  useEffect(
    () =>
      session.subscribe((change) => {
        const completed = change.completion === 'completed';
        if (!change.responseChanged && !completed) return;
        const { onChange: changed, onComplete: complete } = handlers.current;
        if (changed === undefined && complete === undefined) return;
        // Without `authored`: the host stamps it when it stores or sends the response.
        const { authored, ...response } = emitResponse(session);
        void authored;
        box.last = response;
        if (change.responseChanged) changed?.(response);
        if (completed) complete?.(response);
      }),
    [session, box],
  );

  const idPrefix = useId();
  const catalogueKey = messages === undefined ? '' : JSON.stringify(messages);
  const view = useMemo(
    () => createView(session, { idPrefix, locale, ...(timeZone === undefined ? {} : { timeZone }), ...(messages === undefined ? {} : { messages }) }),
    // `messages` by content, so a host that writes the object inline keeps its view and drafts.
    [session, idPrefix, locale, timeZone, catalogueKey],
  );
  const model = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  return { session, view: model };
}
