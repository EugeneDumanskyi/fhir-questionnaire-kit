---
'@fhirq/core': minor
---

Validation. A session checks the visible answers against the built-in rules
(`required`, `maxLength`, `minValue` and `maxValue`, `maxDecimalPlaces`, a
quantity's unit, `minOccurs` and `maxOccurs`) and against cross-field rules
passed as `SessionOptions.rules`. `SessionState.issues` is the ordered result.
`Issue` gains `linkId`, `message` (a catalogue key) and `params` (the authored
limit, never the entered value), a `warning` severity, and form-level issues
with a `null` path.
