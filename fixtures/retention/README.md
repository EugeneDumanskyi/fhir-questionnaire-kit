# `retention`

**Behaviour:** What happens to a hidden answer: retain-exclude restores it, discard erases it and resets a repeating group (AC-05.2.1, AC-05.2.3, AC-05.2.6, ADR-0011, SM-02).

The final `answers` check shows whether `amount`'s answer came back.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
