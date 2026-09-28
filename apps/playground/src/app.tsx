import type { Session } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { useSyncExternalStore, type JSX } from 'react';

import hostSource from './host.ts?raw';
import { messages } from './host.js';

/** ADR-0019, where the policy the page runs under is written down. */
const POLICY = 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/adr/0019-static-client-only-playground-and-docs.md';

/**
 * The first screen (M9 AC-1, AC-2, AC-5): one sentence, the privacy
 * statement, and the demo form, working, with nothing to set up first.
 */
export function App({ session }: { readonly session: Session }): JSX.Element {
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
        <Questionnaire session={session} messages={messages} />
        <Score session={session} />
        <details className="host">
          <summary>The host code behind this form</summary>
          <pre>
            <code>{hostSource}</code>
          </pre>
        </details>
      </section>
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
