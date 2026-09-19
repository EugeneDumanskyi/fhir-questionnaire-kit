# `scores`

**Behaviour:** A host scorer reads the visible answers only and its result is exposed, not interpreted; a scorer that throws is cleared and reported, and the others go on (US-07.2, AC-07.2.1, AC-07.2.2, AC-07.2.4, ADR-0006, INV-X-04, INV-X-05).

The scorers are the runner's doubles (`fixtures/README.md`): `sum` adds the named items' visible answers and is `null` until each is there, so hiding `second` clears the total rather than keep a retained answer in it. `scores` lists each result at the end; the diagnostic names the scorer, never what it threw.

**Authored** for the kit, not copied from the HL7 specification. The PHQ-9 and GAD-7 worked examples are a separate fixture (`fixtures/scoring/`). `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
