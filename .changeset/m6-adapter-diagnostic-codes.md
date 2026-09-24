---
'@fhirq/core': minor
---

`DiagnosticCode` gains `controlled-value-replaced` and `control-contract`. The engine never raises either: a renderer does, and hands it to the host. `Diagnostic.expected` also names the attribute a tier-3 control left off. See `docs/07-api.md` §3.6.
