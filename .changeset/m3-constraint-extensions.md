---
'@fhirq/core': minor
---

Reads the HL7 `minValue`, `maxValue` and `maxDecimalPlaces` extensions. A value
or cardinality constraint on an item type it cannot apply to is the new
`inapplicable-constraint` finding (INV-D-20): it rejects a strict load and is
ignored with a diagnostic in a lenient one.
