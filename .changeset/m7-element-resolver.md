---
'@fhirq/element': minor
---

`<fhir-questionnaire>` resolves value sets. The `resolver` property takes an `OptionResolver`. Without one, a `value-set-base` attribute selects the default resolver, which makes one `GET {value-set-base}/ValueSet/$expand?url={canonical}` per value set and flattens the expansion's nested `contains`. Its failures reject with `FhirqError` `request-failed`, and the item shows its retry. Both are read when the element makes its session. See `docs/07-api.md` §7.
