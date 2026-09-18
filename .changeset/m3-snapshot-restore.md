---
'@fhirq/core': minor
---

A new entry point, `@fhirq/core/resume` (ADR-0021). `snapshot(session)` writes
the session's full stored state as JSON, retained answers included, and
`restoreSession(questionnaire, snapshot, options?)` rebuilds it exactly. A
snapshot taken against another canonical or version is refused with
`snapshot-mismatch`, and another format with `snapshot-format`.
`Diagnostic` gains optional `expected` and `found`, which a mismatch finding
uses to name both canonicals, and `DiagnosticCode` gains the four hydration
codes `hydrateSession` reports.
