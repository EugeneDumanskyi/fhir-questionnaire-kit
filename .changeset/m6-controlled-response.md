---
'@fhirq/react': minor
---

`<Questionnaire>` and `useQuestionnaire` take `value`, `onChange`, `onComplete` and `onDiagnostic`. `onChange` and `onComplete` hand over the response without `authored`. A host that stores the response and passes it back, as the same object, a structured clone or a JSON copy, keeps its session with retained answers and shown errors. A response that is not such an echo replaces the session with one hydrated from it and raises `controlled-value-replaced`.
