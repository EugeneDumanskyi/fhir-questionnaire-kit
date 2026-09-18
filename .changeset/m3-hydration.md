---
'@fhirq/core': minor
---

`hydrateSession(questionnaire, response, options?)` in `@fhirq/core/resume`
resumes a session from a stored `QuestionnaireResponse`. It loads what fits,
rebuilds repeat instances, drops answers that land on disabled items, and always
starts `in-progress`. Drift, orphans and quarantined answers become diagnostics
(`version-drift`, `orphan-answer`, `quarantined-answer`,
`hydrated-answer-disabled`) that name paths and types, never values. A
resource that is not an R4 `QuestionnaireResponse` throws `response-rejected`.
