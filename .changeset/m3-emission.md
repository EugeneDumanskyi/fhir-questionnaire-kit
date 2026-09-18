---
'@fhirq/core': minor
---

`emitResponse(session, options?)` returns the session's FHIR R4
`QuestionnaireResponse`: the questionnaire's canonical, the session's status,
the host identity verbatim, `authored`, and the enabled, answered items only,
repeat instances in position order. Adds the `QuestionnaireResponse` type and
the `unknown-session` error code.
