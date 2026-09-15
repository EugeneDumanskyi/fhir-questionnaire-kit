# ADR-0003 — Calculated items are read-only

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** US-07.3 (AC-07.3.1–4), AC-02.2.2, AC-02.5.1, AC-02.5.5 · INV-S-15, INV-D-14 · `04-domain.md` §9.1 D3

## Context

FHIRPath is out of scope, but the engine exposes an expression evaluator seam so that the exclusion is a boundary rather than a gap (US-07.3). Items carrying a calculated-expression extension (or similar) are routed through that seam. With no evaluator supplied, they raise a diagnostic; with a stub evaluator, a test shows a calculated value flowing through.

Such an item then has two possible sources for its value: the evaluator, and the same answer commands every other item accepts. The engine has to say which one wins.

SDC draws a distinction the requirements do not yet use. `calculatedExpression` is recomputed whenever its inputs change. `initialExpression` sets a starting value the respondent may then edit. Only the first is routed through the seam in v1.

## Decision

An item bound to a calculated expression takes its value only from the evaluator. Set and clear commands against it are refused with a reason code, like commands against disabled items (ADR-0002).

The calculated value is recomputed in each evaluation cycle, after enablement has settled, from the visible view. It is not stored state: restoring a snapshot recomputes it. The evaluator must therefore be a pure function of the visible view, and that requirement is part of the seam's documented contract.

With no evaluator supplied, the item has no value, is left out of the emitted response, and carries the diagnostic from AC-07.3.1.

## Alternatives considered

**A. The evaluator sets a starting value and the respondent may override it.** Rejected. That is `initialExpression` behaviour, which v1 does not support. Adding it to calculated items would need an "overridden" flag per item, and rules for whether recalculation resumes when inputs change after an override. That is a second state machine with the questions unanswered by the spec. Authors who want an editable suggestion should use `initialExpression`, which needs a `not supported` row in the conformance matrix when it is written.

**B. Last writer wins.** Rejected. The emitted value would depend on whether the respondent's command or the recalculation ran last, which is exactly the order dependence AC-02.2.2 forbids for enablement. The same reasoning applies to values that feed a clinical record.

**C. Refuse respondent commands but accept host commands.** Rejected. The host already controls the value by supplying the evaluator. A second host-only write path would be two ways to do one thing, and the calculated value would no longer be reproducible from the other answers.

## Consequences

**Benefits**
- **A calculated value in an emitted response can always be reproduced** from the other answers in that response and the evaluator. For derived fields such as BMI or a subtotal, that is the property an auditor needs.
- A calculated value cannot be tampered with through the UI, including through a slot component.
- Nothing extra is stored: snapshots stay free of derived values, and restore recomputes them.

**Costs accepted**
- Editable, pre-computed suggestions cannot be expressed in v1.
- The evaluator must be pure. A host evaluator that reads a clock, a random source or external state will produce values that differ between the live session and a restored one. This is documented as a contract violation, not handled.
- Without an evaluator, calculated items are inert. That is visible through diagnostics rather than silent.

## Verification

- The stub-evaluator test from AC-07.3.2 also asserts that set and clear against the calculated item are refused and leave its value unchanged.
- A test restores a snapshot and asserts that the calculated value matches the one in the live session it was taken from.

## Follow-ups

**Accepted on 2026-09-15 as AC-02.5.5.** An `enableWhen` that tests a calculated item creates a dependency the engine cannot see: the evaluator is opaque, so its inputs are unknown to the dependency graph. That means cycle detection (AC-02.5.1) cannot prove the combined graph is acyclic. The rule is therefore that a condition referencing a calculated item is rejected at load in `strict` mode and evaluates to false with a diagnostic in `lenient` mode.
