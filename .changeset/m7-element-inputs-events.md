---
'@fhirq/core': minor
'@fhirq/element': minor
---

`<fhir-questionnaire>` takes its form from a `questionnaire` property, a `src` attribute or a host's `session`, whichever was set last. It makes its session on first connect, keeps it across reconnects and disposes one it made when replaced. `locale` falls back to `lang`, then the browser's language, then `"en"`, alongside `timeZone` and `messages`. It raises `fhirq-change` and `fhirq-complete` with the response as plain data without `authored`, and `fhirq-error` when the questionnaire cannot be loaded. `requestCompletion()` completes the form. See `docs/07-api.md` §7.

`FhirqErrorCode` gains `request-failed`, which the element's `src` request rejects with, and `FhirqError` takes the `cause` of what failed underneath.
