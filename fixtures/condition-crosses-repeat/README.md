# `condition-crosses-repeat`

**Behaviour:** A condition outside a repeating group reading an item inside it (AC-02.5.4, INV-D-13, T3, plan D5).

R4 resolves this by document position; the kit does not implement that rule. `strict` rejects; `lenient` evaluates `false`.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
