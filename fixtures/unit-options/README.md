# `unit-options`

**Behaviour:** A quantity offers the units `questionnaire-unitOption` permits, and its answer carries `value`, `unit`, `system` and `code`; a value with no unit fails validation (AC-01.2.4, M5 plan D6). A unit option on another item type is an inapplicable constraint (INV-D-20): it rejects a strict load and is ignored with a diagnostic in a lenient one.

The extension is HL7's registered `http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption`; the units are UCUM codes. `packages/core/test/conformance/view.test.ts` checks the view offers the two units by their display, in authored order.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
