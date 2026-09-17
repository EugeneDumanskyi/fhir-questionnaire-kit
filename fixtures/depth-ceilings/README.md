# `depth-ceilings`

**Behaviour:** Group nesting and enableWhen chains deeper than the published ceilings reject the load in both modes (INV-D-07, NFR-P-05).

Eleven nested groups and a chain of eleven conditions, each one over its ceiling of ten. The deepest group and the last item in the chain are named.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
