---
'@fhirq/core': minor
---

`@fhirq/core/view` becomes the full presentation model. `createView(session,
options)` now needs a `locale` and takes an optional `timeZone`, and returns a
tree of view nodes: groups hold their children, and repeating groups hold their
instances. It has a semantic control kind for every supported item type,
`itemControl` hints honoured where they fit, options with their resolution
state, and entry controls that keep typed text until it is a value (`not-a-date`,
`not-a-number`). Issue text names the limit and the value entered, dates and
numbers are formatted through `Intl`, and the model carries repeat metadata with
an inert add control and its reason, the error summary, one announcement per
cycle and focus targets. `ControlView` and `ControlProps` are the tier-3 control
contract. The spike's `YesNoViewNode`, `ShortTextViewNode`, `YesNoChoice` and
`ErrorSummaryEntry` are gone.
