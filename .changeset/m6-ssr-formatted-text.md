---
'@fhirq/react': patch
---

Server-rendered forms hydrate without a warning when the browser's `Intl` words a formatted value differently from the server's, as Safari does with a date and time. The text is still formatted from your `locale`; React 19 keeps the server's wording until the value changes, and React 18 shows the browser's.
