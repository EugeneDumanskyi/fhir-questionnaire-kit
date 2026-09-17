# `option-value-types`

**Behaviour:** Answer option values other than Coding, string, integer and date (INV-D-19, plan D4).

`strict` rejects, naming each item once per unsupported value type; `lenient` turns the item into a placeholder.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
