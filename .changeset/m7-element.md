---
'@fhirq/element': minor
---

`<fhir-questionnaire>` renders every control kind, not only yes/no and short text. That covers long text, numbers, dates and date-times, quantities with a listed or typed unit, and repeating questions. It covers the five option kinds, with a value set's status and retry and an open choice's free text. It also covers calculated values, statements, unsupported placeholders, groups and repeating groups. The markup follows `docs/08-dom-contract.md` §3. Each answer patches the form in place: a part of the form that did not change is not touched, and the control you are typing in is never moved or replaced, so focus and the caret stay where they are. With its theme, core and view, the element is at most 31.7 kB gzipped, and the script-tag file at most 31.9 kB.
