import { createSession, type OptionResolver, type Questionnaire, type Session, type SessionOptions } from '@fhirq/core';
import { createView, type ViewModel, type ViewOptions } from '@fhirq/core/view';
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';

/**
 * A session the hook created, and so owns (ADR-0015): its resolver is gated
 * until a mount effect opens it, and it is disposed once nothing mounted
 * holds it.
 */
interface Owned {
  readonly session: Session;
  /** A mount effect holds the session, which opens the resolver gate. */
  readonly hold: () => void;
  /** An effect cleanup lets go. The session is disposed a microtask later unless a mount holds it again. */
  readonly letGo: () => void;
}

const isSession = (source: Questionnaire | Session): source is Session => typeof (source as Partial<Session>).dispatch === 'function';

/**
 * Creates a component-owned session. Core calls the resolver as the session
 * starts, which is during render here, on the server too, and twice under
 * StrictMode. So core gets a wrapper whose call waits for the gate, and the
 * host's resolver runs only once a mount effect has opened it, and never for
 * a session that was aborted first (ADR-0015 amendment note, M6 plan D3).
 *
 * Disposal waits a microtask: StrictMode runs a mount's cleanup and its
 * effect again in one pass, and the session must survive that; a real
 * unmount leaves nothing holding it.
 */
function own(questionnaire: Questionnaire, options: SessionOptions = {}): Owned {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const { resolver } = options;
  const gated: OptionResolver | undefined =
    resolver === undefined ? undefined : (valueSet, context) => opened.then(() => (context.signal.aborted ? [] : resolver(valueSet, context)));
  const session = createSession(questionnaire, { ...options, ...(gated === undefined ? {} : { resolver: gated }) });
  let holders = 0;
  return {
    session,
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
    readonly locale?: string;
    /** An IANA zone to read and show `dateTime` answers in. Default: none, so a time needs its offset written. */
    readonly timeZone?: string;
    /** Catalogue overrides, merged key by key over the built-in `en` text. */
    readonly messages?: ViewOptions['messages'];
    /** Session options for a session the hook creates; ignored with a session. */
    readonly options?: SessionOptions;
  } = {},
): { readonly session: Session; readonly view: ViewModel } {
  const { locale = 'en', timeZone, messages } = options;
  // One box per component. A session is created in it the first time a render
  // has a questionnaire; a StrictMode render that is discarded discards its box.
  const [box] = useState<{ current: Owned | null }>(() => ({ current: null }));
  const owned = isSession(source) ? null : (box.current ??= own(source, options.options));
  const session = owned === null ? (source as Session) : owned.session;

  useEffect(() => {
    if (owned === null) return undefined;
    owned.hold();
    return owned.letGo;
  }, [owned]);

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
