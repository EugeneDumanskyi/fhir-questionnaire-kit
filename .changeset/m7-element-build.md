---
'@fhirq/element': minor
---

`@fhirq/element` is built as ESM plus a script-tag bundle, the formats NFR-C-05 lists for it. `@fhirq/element` is ESM with the theme inlined and `@fhirq/core` left to its dependency. Importing `@fhirq/element/define` registers `<fhir-questionnaire>`. `dist/fhirq-element.js` is one file for a `<script>` tag: it registers the element and exposes `fhirq.createSession`. The CommonJS export is gone, and `@fhirq/themes` is no longer a dependency, since the theme is inlined.
