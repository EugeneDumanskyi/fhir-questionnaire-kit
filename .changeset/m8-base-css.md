---
'@fhirq/themes': minor
---

`base.css` styles every part of the DOM contract: groups, repeat instances, the add, remove and retry buttons, quantity units, checkboxes, the "other" answer, option status, and the read-only kinds. Every primary control is at least `--fhirq-target-size`, one focus ring covers every focusable part of the form, and reduced motion and forced colours are handled. Inside the element, inherited text properties from the host page (`letter-spacing`, `word-spacing`, `text-transform`, `text-align`, `font-style`, `cursor`) no longer reach the form.
