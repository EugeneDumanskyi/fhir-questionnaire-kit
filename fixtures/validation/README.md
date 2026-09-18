# `validation`

**Behaviour:** Built-in rules on the visible answers: required, maxLength, minValue and maxValue, maxDecimalPlaces, a quantity unit, minOccurs; the limit named, never the value; document order; a hidden required item exempt (AC-04.1.1, AC-04.1.2, AC-04.2.1, AC-01.2.4, INV-V-01, INV-V-06, INV-V-08, SM-05).

Limits come from R4 `maxLength` and `required`, the HL7 extensions `minValue`, `maxValue` and `maxDecimalPlaces`, and `questionnaire-minOccurs`. `issues` lists the validation result at the end of each case. "Not a date" is not here: the engine holds only typed answers, so it is the view's issue on a draft (M3 plan D2).

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
