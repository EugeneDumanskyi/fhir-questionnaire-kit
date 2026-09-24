---
'@fhirq/react': minor
---

`<Questionnaire>` takes `controls`: a host's control per control kind, such as `controls={{ 'calendar-date': MyPicker }}`, rendered inside the kit's label, required marker and errors (`docs/08-dom-contract.md` §3.9). In development, a control that leaves out `ids.control`, `aria-invalid` or `aria-describedby` raises `control-contract` through `onDiagnostic` and the console.
