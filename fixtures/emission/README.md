# `emission`

**Behaviour:** The emitted QuestionnaireResponse: enabled, answered items only, mirroring the definition, repeat instances in position order, host identity verbatim, status from the session (AC-05.1.1 to AC-05.1.3, AC-05.2.2, AC-03.3.1, INV-E-01 to INV-E-05).

`expected-response.json` and `expected-completed.json` are what each case emits at its end, with `authored` fixed by the runner. `amount` is answered, then hidden: it is retained and absent. The first medicine instance is removed, and the second has only a dose, so the response has two `meds` items in position order. R4 `QuestionnaireResponse` (4.0.1): `item` mirrors `Questionnaire.item`, a repeating group is one item per instance.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
