---
'@fhirq/core': minor
---

Host collaborators, as `SessionOptions` fields:
- `resolver` (`OptionResolver`) resolves `answerValueSet` options once per canonical at creation. Retry is the new `RetryOptions` command, and `session.dispose()` aborts the resolver's signal. The status of each option set is on `SessionState.optionSets`.
- `scorers` gives results on `SessionState.scores`.
- `evaluator` (`ExpressionEvaluator`) computes `calculatedExpression` values.
- `sanitize` keeps `rendering-xhtml` rich text as `ItemDefinition.xhtml`.
- `onCollaboratorError` receives what any of them threw.

Scorers and the evaluator read a frozen `VisibleProjection`.

A collaborator that throws becomes a diagnostic without its message, and the form stays live. A command sent from inside a collaborator is refused as `collaborator-running`.

There are new diagnostic codes and refusal reasons.

`@fhirq/core`'s published size budget is now 15 kB (ADR-0022). See `docs/07-api.md` §3.9.
