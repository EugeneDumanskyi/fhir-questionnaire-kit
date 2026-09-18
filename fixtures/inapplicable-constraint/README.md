# `inapplicable-constraint`

**Behaviour:** A value constraint its item type cannot have: minValue on a string (INV-D-20).

Strict rejects the load; lenient ignores the constraint with an `error`-severity diagnostic, as for every finding strict would reject.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
