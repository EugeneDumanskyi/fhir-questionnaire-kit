# ADR-0017 — FHIRPath is excluded; expressions route through an evaluator seam

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** Brief §5 (FHIRPath out of scope) · US-07.3 (AC-07.3.1–4), US-01.3 (AC-01.3.3), AC-02.5.5 · NFR-S-01, NFR-S-02, NFR-S-05, NFR-C-07, NFR-U-05 · INV-D-09, INV-D-14, INV-D-15, INV-S-15, INV-X-09 · ADR-0003, ADR-0006, ADR-0009 · `05-architecture.md` §9 AT3 · NFR-M-05 topic *FHIRPath exclusion and its seam*

## Context

Structured Data Capture (SDC) adds expression-bearing extensions to Questionnaire, usually in FHIRPath: `calculatedExpression`, `initialExpression`, `enableWhenExpression`, `answerExpression` and others. Supporting FHIRPath means a language implementation: a parser, an evaluator over FHIR data with its type system, and SDC's variable and context rules. That is a large correctness surface.

Three facts constrain the design:
- **Zero dependencies (ADR-0008).** Existing JavaScript FHIRPath implementations would be runtime dependencies, and FHIRPath's size alone would exceed the 14 kB core budget (NFR-S-02). A peer dependency is also ruled out (NFR-S-05).
- **No `eval` or `new Function` (NFR-C-07),** which rules out compiling expressions to JavaScript.
- **The exclusion must be a boundary, not a gap** (US-07.3): there must be a named place where an evaluator attaches, and a test proving it works.

ADR-0003 already decides that calculated items are read-only once the seam exists. This ADR argues for the exclusion and the seam's shape, and settles what happens to expression extensions the seam does *not* cover. That last question is currently open, and it has patient-safety implications.

## Options considered

**A. Implement a FHIRPath subset in core.** Rejected. Any subset is a new dialect whose boundary questionnaire authors cannot see; a questionnaire works or fails depending on which functions it happens to use. Byte cost and mutation-testing scope would both grow substantially, and the work delivers "little architectural payoff" (Brief §5).

**B. Optional integration with an existing FHIRPath library.** Rejected. As a dependency it breaks NFR-S-01, and as a peer it breaks NFR-S-05. A documented recipe showing hosts how to wrap such a library in the seam (option D) gets the same practical result without the kit shipping it.

**C. Ignore expression extensions.** Rejected. A questionnaire using `enableWhenExpression` would show every gated question to every respondent, and nobody would notice. That is the silent half-rendering US-01.3 forbids, with a patient-safety edge.

**D. A synchronous evaluator port for `calculatedExpression`; every other expression extension handled like an unsupported construct.** Chosen.

## Decision

**The seam** (`ports/`, exported type):

```ts
interface ExpressionEvaluator {
  evaluate(
    expression: { language: string; expression: string; name?: string },
    context: { path: ItemPath; projection: VisibleProjection }
  ): AnswerValue | undefined;
}
```

- **Synchronous and pure,** because it runs inside the evaluation cycle (ADR-0009 step 4). It must return the same value for the same projection (ADR-0003).
- **Only `calculatedExpression` is routed through it in v1.** An item bound to one is read-only (INV-S-15). Conditions may not reference it (INV-D-14).
- **No evaluator supplied:** the item has no value, is excluded from emission, and a diagnostic is raised. Load still succeeds (INV-D-09).
- **Evaluator throws:** the value is cleared and a diagnostic is raised without the thrown message text. The cycle continues (INV-X-09, ADR-0006).
- **Declared inputs:** the evaluator receives the full visible projection. Re-evaluation is scheduled on any change to the projection's answers or enablement unless the binding declares input `linkId`s through the host's registration (same contract as rules, ADR-0009).

**Other expression extensions are unsupported constructs** (accepted on 2026-09-15 as AC-01.3.3 and INV-D-15, `05-architecture.md` §9 AT3):

| Extension | `strict` | `lenient` |
|---|---|---|
| `enableWhenExpression` | Reject, naming each `linkId` | Item **disabled** + diagnostic. The fail-safe direction: a question the author meant to gate is hidden rather than shown. |
| `answerExpression`, `candidateExpression` | Reject | Item has no options (behaves as `unresolved-options`) + diagnostic |
| `initialExpression` | Reject | Ignored + diagnostic (the item starts empty, which is the respondent's normal starting point) |
| `variable`, `launchContext` and other context extensions | Diagnostic only | Diagnostic only |

The conformance matrix lists each as `not supported`, linking this ADR, with FHIRPath itself as `out of scope`.

**Recipe, not package.** The docs show a host wrapping a third-party FHIRPath implementation in `ExpressionEvaluator`, noting that it becomes the host's dependency and review item.

## Consequences

**Benefits**
- **The exclusion is visible and safe:** no expression extension is ever silently ignored in a way that changes which questions a respondent sees.
- **Hosts who need FHIRPath can have it** without the kit carrying it, and the dependency-review decision stays with the party who can make it.
- **The seam is proven, not decorative:** a stub evaluator test drives a calculated value end to end (AC-07.3.2).
- **The lenient default for `enableWhenExpression` fails safe.** Hiding a gated question can lose an answer the author wanted; showing it can put an irrelevant or distressing clinical question in front of a patient who was meant to be spared it. The first is the lesser harm, and it is visible in diagnostics.

**Costs accepted**
- **Many real SDC questionnaires will not load in `strict` mode.** Instruments authored with heavy FHIRPath use are outside the kit's surface. This is the honest consequence of Brief §5, and the load error must say which extension caused it, so evaluation is fast.
- **Only `calculatedExpression` is pluggable.** A host with a full FHIRPath evaluator still cannot use it for `enableWhenExpression`, because conditions must be visible to the static dependency graph (ADR-0009, INV-D-14). Making them pluggable would need the evaluator to declare its inputs, which is a design for a later ADR.
- **A synchronous-only seam** excludes evaluators that need I/O. That is acceptable, because SDC expressions are defined over the resource in hand.
**Verification**
- AC-07.3.2 stub-evaluator test: a BMI item calculated from height and weight updates in the same cycle as either input changes, and is absent from emission when either input is hidden.
- Load tests for each row of the table, in both modes, asserting the error or diagnostic names the extension and the `linkId` path.
- A lenient-mode test confirms that an item carrying `enableWhenExpression` is disabled, excluded from validation and emission, and that its dependants evaluate against it as unanswered.
- A conformance matrix check: every extension in the table has a row with status `not supported` and a link to this ADR.
