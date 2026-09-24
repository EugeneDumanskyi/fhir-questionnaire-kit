---
'@fhirq/react': minor
---

`useQuestionnaire(questionnaire | session, options?)` returns the session and its view model. Given a questionnaire, it creates and owns the session: it calls the resolver only after mount, never on the server, and disposes the session on unmount. `<Questionnaire>` takes a `questionnaire` or a `session`, with `locale` (default `"en"`), `timeZone`, `messages` and session `options`, and renders from the hook alone. `createSession` is re-exported from `@fhirq/core`. See `docs/07-api.md` §6.
