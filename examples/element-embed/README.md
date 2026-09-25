# Element embed

A FHIR R4 `Questionnaire` rendered as an accessible form by one script tag
and one element, with no bundler, transpiler or framework (AC-09.1.1).

```html
<script src="fhirq-element.js"></script>

<fhir-questionnaire src="demo.json"></fhir-questionnaire>
```

- `fhirq-element.js` is `@fhirq/element`'s script-tag build. Loading it
  registers `<fhir-questionnaire>`; the form's styles are inside it, so there
  is no stylesheet to host.
- `src` names the questionnaire, as R4 JSON. The element makes one `GET` for
  it. [`demo.json`](demo.json) is a copy of the kit's demonstration form
  (`fixtures/demo`); it is not for clinical use.
- The page runs under `default-src 'self'; script-src 'self'; style-src
  'self'`, set in [`index.html`](index.html). The element needs nothing more.
- To hear answers, listen for `fhirq-change` and `fhirq-complete` on the
  element, and call its `requestCompletion()` from your own submit button.
  Both need a script of your own, which is why this page has none.
- The form stores nothing. Saving the response is up to you.

## Running it

From the repository root:

```sh
pnpm build:element
cp packages/element/dist/fhirq-element.js examples/element-embed/
python3 -m http.server --directory examples/element-embed 8000
```

Then open <http://localhost:8000>. Any static server will do. Opening
`index.html` from disk will not: a browser does not let a `file:` page fetch
`demo.json`.

CI serves this directory as it is, with the script built from the sources, in
Chromium, Firefox and WebKit. It checks that the form renders, takes answers
and shows a conditional question, and that `demo.json` is still the
demonstration form (`tests/browser/embed.spec.ts`); that nothing breaks the
policy (`csp.spec.ts`); and that axe finds nothing (`element-a11y.spec.ts`).
