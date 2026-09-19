# `option-resolution`

**Behaviour:** Value sets resolve once each, at session start, whatever is enabled; a coded answer waits for its options while open-choice text does not; a failure is retried only on request (SM-04, ADR-0005, ADR-0012, AC-07.1.1, AC-07.1.2, AC-01.1.2, INV-D-08).

`substance` is on a branch that starts closed, and its value set resolves at start all the same. The resolver is the runner's in-memory double (`fixtures/README.md`): it fulfils, rejects or never settles, per value set. `optionSets` lists each set's status at the end. The call count and path independence are `packages/core/test/session/options.test.ts`'s, as a property.

**Authored** for the kit, not copied from the HL7 specification. The value set canonicals are `urn:` names that resolve nowhere. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
