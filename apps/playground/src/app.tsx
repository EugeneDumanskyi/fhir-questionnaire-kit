import type { Session } from '@fhirq/core';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react';

import hostSource from './host.ts?raw';
import type { Loaded, Source } from './load.js';
import type { Scheme, Tier } from './choices.js';
import { Tier1 } from './tiers/tier1.js';

/** Everything past the first screen comes in its own chunk, after it (ADR-0019, plan S3). */
const Panes = lazy(() => import('./panes.js').then(({ Panes: component }) => ({ default: component })));
const Editor = lazy(() => import('./editor.js').then(({ Editor: component }) => ({ default: component })));
const Switcher = lazy(() => import('./switcher.js').then(({ Switcher: component }) => ({ default: component })));
const TierForm = lazy(() => import('./switcher.js').then(({ TierForm: component }) => ({ default: component })));
const Share = lazy(() => import('./share.js').then(({ Share: component }) => ({ default: component })));

/** ADR-0019, where the policy the page runs under is written down. */
const POLICY = 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/adr/0019-static-client-only-playground-and-docs.md';

/** The questionnaire the page shows, and whether the demo's host code runs with it. */
interface Shown {
  readonly session: Session;
  readonly hostCode: boolean;
  /** Counts loads, so each session gets a fresh form. */
  readonly key: number;
}

/** What the page opens on: the demo, or what a share link carries. */
export interface Start {
  readonly session: Session;
  readonly hostCode: boolean;
  /** What the editor holds, and what became of it; `null` when it is the demo, loaded already. */
  readonly source: Source & { readonly loaded: Loaded | null };
  readonly tier: Tier;
  readonly scheme: Scheme;
  /** A share link was given that this page cannot read. */
  readonly broken: boolean;
}

/**
 * The first screen (M9 AC-1, AC-2, AC-5): one sentence, the privacy
 * statement, and the demo form, working, with nothing to set up first. The
 * editor replaces the session; the form and the panes follow it. The switcher
 * draws the form in another tier, over the same session. A share link holds
 * what the editor last loaded, the tier and the scheme.
 */
export function App({ demo, start }: { readonly demo: string; readonly start: Start }): JSX.Element {
  const idle = useIdle();
  const [{ session, hostCode, key }, setShown] = useState<Shown>({ session: start.session, hostCode: start.hostCode, key: 0 });
  const [source, setSource] = useState<Source>(start.source);
  const [tier, setTier] = useState<Tier>(start.tier);
  const [scheme, setScheme] = useState<Scheme>(start.scheme);
  const onLoad = useCallback((next: Source, loaded: Loaded) => {
    setSource(next);
    if (loaded.kind === 'loaded') setShown(({ key: last }) => ({ session: loaded.session, hostCode: loaded.hostCode, key: last + 1 }));
  }, []);
  const shared = useMemo(() => ({ text: source.text, mode: source.mode, tier, scheme }), [source, tier, scheme]);
  useEffect(() => {
    const root = document.documentElement;
    if (scheme === 'system') delete root.dataset['scheme'];
    else root.dataset['scheme'] = scheme;
  }, [scheme]);
  return (
    <main className="playground">
      <header className="intro">
        <h1>FHIR Questionnaire Kit</h1>
        <p className="pitch">Renders a FHIR R4 Questionnaire as an accessible form, and emits a valid QuestionnaireResponse.</p>
        <p className="privacy">
          Nothing leaves your browser: this page is not allowed to connect anywhere. <a href={POLICY}>The policy</a>
        </p>
        {start.broken && <p className="privacy">This link could not be read, so the page opened as it would without one.</p>}
      </header>
      <section className="demo" aria-label="Demonstration form">
        {tier === 1 ? (
          <Tier1 key={key} session={session} />
        ) : (
          <Suspense fallback={null}>
            <TierForm key={key} tier={tier} session={session} />
          </Suspense>
        )}
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
          <Switcher tier={tier} onTier={setTier} scheme={scheme} onScheme={setScheme} />
          <Panes session={session} />
          <Editor demo={demo} start={start.source} onLoad={onLoad} />
          <Share shared={shared} />
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
