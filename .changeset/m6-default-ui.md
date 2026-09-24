---
'@fhirq/react': minor
---

`<Questionnaire>` renders every control kind, not only yes/no and short text. That covers long text, numbers, dates and date-times, quantities with a listed or typed unit, and repeating questions. It covers the five option kinds, with a value set's status and retry and an open choice's free text. It also covers calculated values, statements, unsupported placeholders, groups and repeating groups. The markup follows `docs/08-dom-contract.md` §3, and each item re-renders only when its own view node changes.
