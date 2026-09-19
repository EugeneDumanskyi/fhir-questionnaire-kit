# `calculated-values`

**Behaviour:** A `calculatedExpression` is computed by the host's evaluator in document order, read-only, and emitted like an answer; one that reads a later calculated item sees the previous cycle's value; without an evaluator it has no value (US-07.3, AC-07.3.1–3, ADR-0017, ADR-0009 step 4, INV-D-09).

`earlier` comes before `total` and reads it, so after `b` it still holds the value from before; the next change that touches answers catches it up. That lag is documented behaviour, not a defect (ADR-0009, "Calculated items reading other calculated items"). The evaluator is the runner's double (`fixtures/README.md`), which adds up the items each binding names: the kit has no FHIRPath, and the expressions are there for a host's evaluator, not this one.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
