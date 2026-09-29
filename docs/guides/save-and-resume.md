# Save and resume

The kit stores nothing. It gives you two things to store, and two ways back,
deliberately different ([`07-api.md` §4](../07-api.md#4-fhirqcoreresume)).

| | Store | Brings back | Across questionnaire versions |
|---|---|---|---|
| **Restore** | A snapshot: engine state | Everything, answers to hidden questions included | No: refused |
| **Hydrate** | An emitted `QuestionnaireResponse` | Only what the response holds | Yes, with a diagnostic for each answer that no longer fits |

Both live in `@fhirq/core/resume`, a separate entry point, so a host that never
resumes does not carry them
([ADR-0021](../adr/0021-resume-entry-point-and-staged-element-budget.md)).

## Saving a draft

<!-- snippet: docs/examples/src/storage.ts#save -->
```ts
import { createSession } from '@fhirq/core';
import { snapshot } from '@fhirq/core/resume';

const session = createSession(questionnaire);
session.subscribe(() => drafts.set(key, JSON.stringify(snapshot(session))));
```

`subscribe` calls back once per change that altered something visible, so
the draft is never older than the screen. `drafts` stands in for your own
storage.

**A snapshot needs the same care as the response.** It holds answers the
response leaves out: those to questions the respondent has since hidden
([hidden answers](retention.md)). Store it where you store clinical data.

## Opening it again

<!-- snippet: docs/examples/src/storage.ts#load -->
```ts
import { restoreSession } from '@fhirq/core/resume';

const saved = drafts.get(key);
const resumed = saved === undefined ? createSession(questionnaire) : restoreSession(questionnaire, JSON.parse(saved) as unknown);
```

The restored session is indistinguishable from the one saved: the same
answers, hidden ones included, the same repeat instances, and the same errors
on show. It takes its retention policy and host identity from the snapshot.
Rules, scorers and other collaborators are not in a snapshot: pass them to
`restoreSession` as you did to `createSession`.

A snapshot taken against another questionnaire canonical or version is
refused with `snapshot-mismatch`: it is not a migration format. To carry a
draft across versions, hydrate from the last emitted response instead.

## From a stored response

<!-- snippet: docs/examples/src/resume.ts#resume -->
```ts
import { hydrateSession, restoreSession, snapshot } from '@fhirq/core/resume';

// Engine state: the hidden answer to "per-day" comes back.
const restored = restoreSession(questionnaire, snapshot(session));
// A stored response: only what was emitted comes back.
const hydrated = hydrateSession(questionnaire, emitResponse(session));
```

Hydration loads every answer that fits, rebuilds repeat instances in their
stored order, and starts `in-progress` whatever the stored status. What does
not fit is never loaded and never emitted: each is a warning in
`session.diagnostics` (`version-drift`, `orphan-answer`, `quarantined-answer`,
`hydrated-answer-disabled`), carrying a path and never a value.

## In the renderers

- **React:** pass a stored response as `value` and `useQuestionnaire` hydrates
  it. To restore a snapshot, call `restoreSession` yourself and pass the
  session ([`07-api.md` §6.1](../07-api.md#61-usequestionnairesource-options)).
- **The element:** set its `session` property to the session `restoreSession`
  or `hydrateSession` returns. The script-tag build does not carry
  `@fhirq/core/resume`; import it with a bundler.
