# `hydration`

**Behaviour:** Resuming from a stored response: answers loaded and enablement settled, repeat instances rebuilt with answers in instance 2, drift, orphans and quarantine reported by path and type, answers on disabled items dropped, always in-progress, and a lossless round trip (AC-06.1.1 to AC-06.1.5, AC-06.3.1 to AC-06.3.3, INV-E-06, INV-E-08 to INV-E-11).

`response.json` is a stored response against version 1, `completed`: `amount` lands on a disabled item, `gone` is not in the questionnaire, `tags` holds an integer and `born` two dates. `expected-response.json` is what the resumed session emits, and hydrating it emits it again. `amended.json` has R4's `amended` status, which the kit does not support: the session resumes `in-progress` (AC-05.1.4). Diagnostics name paths and types only (`04-domain.md` §8).

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
