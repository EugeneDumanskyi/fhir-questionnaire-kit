---
'@fhirq/themes': minor
---

The token set is complete and `TOKENS` is `@beta`. Two tokens are new: `--fhirq-color-text-muted` and `--fhirq-font-size-subheading`. `default.css` gives both a value, and muted text a dark one. In the element, a token is set on `fhir-questionnaire` itself; an ancestor's value does not reach the form. In React, any ancestor still works.
