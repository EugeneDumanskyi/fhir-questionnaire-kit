---
'@fhirq/element': minor
---

`<fhir-questionnaire>` takes tier-3 controls. The `controls` property maps an answerable control kind to a custom element tag the host has defined. The element makes that element inside its shadow root, between the kit's label and errors, and sets its `props` to `ControlProps`. The control answers through `props`, or by dispatching `fhirq-set`, `fhirq-clear` and `fhirq-leave` on itself. In development the element checks the control's id and ARIA duties and raises `control-contract` through a new `fhirq-diagnostic` event. Production builds, the script-tag bundle among them, leave the check out. See `docs/07-api.md` §7.
