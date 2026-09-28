import { emitResponse, type Session } from '@fhirq/core';
import { snapshot } from '@fhirq/core/resume';
import { useMemo, useState, useSyncExternalStore, type JSX } from 'react';

type Shown = 'response' | 'state';

/**
 * The response next to the engine state (M9 AC-3, AC-12.2.1), loaded after
 * the first screen. The response is what the kit emits: enabled answers only.
 * The state is the session's full snapshot, which keeps the answer to a
 * question that has been hidden, so hiding one shows as a difference between
 * the two. Side by side on a wide screen, one at a time with a toggle on a
 * narrow one.
 */
export function Panes({ session }: { readonly session: Session }): JSX.Element {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [shown, setShown] = useState<Shown>('response');
  // Both are recomputed once per cycle, not per render; `state` changes with every cycle that changed anything.
  const response = useMemo(() => JSON.stringify(emitResponse(session), null, 2), [session, state]);
  const stored = useMemo(() => JSON.stringify(snapshot(session), null, 2), [session, state]);

  return (
    <section className="panes" aria-label="The response and the engine state" data-shown={shown}>
      <div className="pane-toggle" role="group" aria-label="Show">
        <button type="button" aria-pressed={shown === 'response'} onClick={() => setShown('response')}>
          Response
        </button>
        <button type="button" aria-pressed={shown === 'state'} onClick={() => setShown('state')}>
          Engine state
        </button>
      </div>
      <Pane id="response" title="The emitted QuestionnaireResponse" note="Enabled answers only: a hidden question's answer is left out." json={response} />
      <Pane id="state" title="The engine state" note="Everything the session keeps, including the answers to hidden questions." json={stored} />
    </section>
  );
}

function Pane({ id, title, note, json }: { readonly id: Shown; readonly title: string; readonly note: string; readonly json: string }): JSX.Element {
  const heading = `pane-${id}-title`;
  return (
    <section className={`pane pane-${id}`} aria-labelledby={heading}>
      <h2 id={heading}>{title}</h2>
      <p className="pane-note">{note}</p>
      {/* Focusable, so a keyboard can scroll it (it overflows). */}
      <pre tabIndex={0} aria-labelledby={heading}>
        <code>{json}</code>
      </pre>
    </section>
  );
}
