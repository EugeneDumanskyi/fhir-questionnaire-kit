# `chain-collapse`

**Behaviour:** A three-deep chain collapses in the cycle that caused it (AC-02.2.1, INV-S-05, M2 AC-3).

Changing A disables B, C and D in one evaluation cycle; the conformance runner checks the settled state after each command, and `test/session/cycle.test.ts` checks the single notification.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
