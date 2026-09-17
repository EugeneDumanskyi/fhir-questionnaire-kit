---
'@fhirq/core': minor
---

The engine's first public API: `createSession(questionnaire, options)` loads a
FHIR R4 `Questionnaire` in `strict` or `lenient` mode and returns a session that
evaluates `enableWhen` incrementally, one command per cycle with at most one
notification. It covers every supported operator and answer type, `enableBehavior`,
repeating groups with add and remove, and both retention policies. Load findings
are typed diagnostics with codes and paths, never answer values. See
`docs/07-api.md`.
