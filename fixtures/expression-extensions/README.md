# `expression-extensions`

**Behaviour:** Expression extensions other than calculatedExpression are never silently ignored (AC-01.3.3, INV-D-15).

`enableWhenExpression` disables its item in `lenient` mode (the safe side); `answerExpression` means no options, which is enforced with the resolver in M4 (plan D13); `initialExpression` is ignored; `variable` is only a diagnostic.

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
