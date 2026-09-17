# `disabled-question-reads-unanswered`

**Behaviour:** A disabled question counts as unanswered for every condition, so a retained answer never satisfies one and != holds (INV-S-04, AC-02.2.4, T4, plan D2).

A disabled question's retained answer never satisfies a condition, and `!=` holds for an unanswered question, as the R4 operator text says.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
