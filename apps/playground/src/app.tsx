import type { Session } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore, type JSX } from 'react';

import hostSource from './host.ts?raw';
import { messages } from './host.js';

/** Everything past the first screen comes in its own chunk, after it (ADR-0019, plan S3). */
const Panes = lazy(() => import('./panes.js').then(({ Panes: component }) => ({ default: component })));
const Editor = lazy(() => import('./editor.js').then(({ Editor: component }) => ({ default: component })));

/** ADR-0019, where the policy the page runs under is written down. */
const POLICY = 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/adr/0019-static-client-only-playground-and-docs.md';

/** The questionnaire the page shows, and whether the demo's host code runs with it. */
interface Shown {
  readonly session: Session;
  readonly hostCode: boolean;
  /** Counts loads, so each session gets a fresh form. */
  readonly key: number;
}

/**
 * The first screen (M9 AC-1, AC-2, AC-5): one sentence, the privacy
 * statement, and the demo form, working, with nothing to set up first. The
 * editor replaces the session; the form and the panes follow it.
 */
export function App({ demo, session: initial }: { readonly demo: string; readonly session: Session }): JSX.Element {
  const idle = useIdle();
  const [{ session, hostCode, key }, setShown] = useState<Shown>({ session: initial, hostCode: true, key: 0 });
  const onLoad = useCallback((next: Session, nextHostCode: boolean) => setShown(({ key: last }) => ({ session: next, hostCode: nextHostCode, key: last + 1 })), []);
  return (
    <main className="playground">
      <header className="intro">
        <h1>FHIR Questionnaire Kit</h1>
        <p className="pitch">Renders a FHIR R4 Questionnaire as an accessible form, and emits a valid QuestionnaireResponse.</p>
        <p className="privacy">
          Nothing leaves your browser: this page is not allowed to connect anywhere. <a href={POLICY}>The policy</a>
        </p>
      </header>
      <section className="demo" aria-label="Demonstration form">
        <Questionnaire key={key} session={session} messages={messages} />
        {hostCode && (
          <>
            <Score session={session} />
            <details className="host">
              <summary>The host code behind this form</summary>
              <pre>
                <code>{hostSource}</code>
              </pre>
            </details>
          </>
        )}
      </section>
      {idle && (
        <Suspense fallback={null}>
          <Panes session={session} />
          <Editor initial={demo} onLoad={onLoad} />
        </Suspense>
      )}
    </main>
  );
}

/** The host's score, which the kit computes and never interprets. */
function Score({ session }: { readonly session: Session }): JSX.Element {
  const score = useSyncExternalStore(session.subscribe, () => session.getSnapshot().scores['wellbeing']);
  return (
    <p className="score" aria-live="polite">
      Wellbeing score: <output>{typeof score === 'number' ? `${score} of 6` : 'answer both wellbeing questions'}</output>
    </p>
  );
}

/** `true` once the browser has been idle after the first render, where it can; soon after it otherwise (Safari). */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(() => setIdle(true));
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(() => setIdle(true), 0);
    return () => clearTimeout(handle);
  }, []);
  return idle;
}
