---
'@fhirq/core': minor
---

`createView` takes partial `messages` overrides, merged key by key over the built-in `en` catalogue. A missing, blank or wrongly shaped key falls back to its default, and an issue key with no text to the generic issue message. See `docs/07-api.md` §5.
