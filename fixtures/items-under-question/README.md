# `items-under-question`

**Behaviour:** Items nested under a question: R4 allows them, the kit does not (INV-D-17, plan D4).

`strict` rejects; `lenient` loads the question and turns its children into placeholders that accept no answer.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
