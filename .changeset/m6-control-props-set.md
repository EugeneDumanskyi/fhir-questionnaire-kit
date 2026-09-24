---
'@fhirq/core': patch
---

`ControlProps<K>['set']` is now the kind's own `set`: text for entry kinds, one key for single choices, a list of keys for multiple ones. It was typed `never` for every kind, so a tier-3 control could not call it without a cast.
