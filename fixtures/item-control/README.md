# `item-control`

**Behaviour:** Each choice gets the control its `itemControl` hint asks for when the hint fits the item, and otherwise the count rule: up to 5 options are all shown, more are a list (INV-P-05, AC-01.2.2, M5 plan D2). `check-box` fits a choice that repeats; `radio-button` and `drop-down` fit one that does not. An unknown hint (`slider`) or one that does not fit falls back to the count rule, silently: the view has no diagnostic channel, so the conformance matrix records it.

The case's `controls` map names the view's control kind for each item. The engine runner ignores it; `packages/core/test/conformance/view.test.ts` checks it through `@fhirq/core/view`. The engine records the hint and does not interpret it (`04-domain.md` BC1).

**Authored** for the kit, not copied from the HL7 specification. `scenario.json` is read by `packages/core/test/conformance/fixtures.test.ts` (shape: `fixtures/README.md`).
