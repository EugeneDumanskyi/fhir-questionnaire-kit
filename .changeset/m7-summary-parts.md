---
'@fhirq/react': patch
'@fhirq/element': patch
---

The error summary's `part` names now share its class stems, as every other part does: `summary`, `summary-heading`, `summary-list`, `summary-entry` and `summary-link`, where they were `error-summary`, `error-summary-heading` and so on. A `::part(error-summary)` rule becomes `::part(summary)`.
