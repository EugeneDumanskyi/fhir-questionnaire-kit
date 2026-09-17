# `duplicate-link-id`

**Behaviour:** A linkId used twice anywhere in the tree rejects the load in both modes (AC-01.1.3, INV-D-02).

The second use is named, with the duplicated `linkId`, even when the two sit at different depths.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
