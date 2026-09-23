---
'@fhirq/core': minor
---

`ItemDefinition.units` carries a quantity's `questionnaire-unitOption` codings, in authored order, and is empty on any other type. A unit option on another item type is an `inapplicable-constraint` diagnostic: a strict load rejects it, and a lenient one ignores it.
