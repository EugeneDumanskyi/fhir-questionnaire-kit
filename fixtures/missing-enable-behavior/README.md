# `missing-enable-behavior`

**Behaviour:** Several conditions and no enableBehavior: R4 requires one (que-12; INV-D-16, AC-02.3.3, plan D1).

R4 defines no default for `enableBehavior` when an item has more than one `enableWhen`. `strict` rejects the questionnaire; `lenient` applies `all` and says so.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
