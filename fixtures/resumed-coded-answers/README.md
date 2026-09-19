# `resumed-coded-answers`

**Behaviour:** A resumed coded answer is loaded, and never invalid only because its options are pending, failed or unknown (T8, AC-07.1.4, AC-06.1.1).

Each case hydrates `response.json`, whose required `drug` holds a coding from a value set, with the resolver pending, rejecting, or absent. The answer is there and `issues` is empty in all three: membership is the resolver's knowledge, not the engine's. Restore is `packages/core/test/resume/options.test.ts`'s.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
