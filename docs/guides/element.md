# Element quickstart

A FHIR R4 `Questionnaire` as an accessible form from one script tag and one
element: no bundler, framework or stylesheet of your own
([ADR-0014](../adr/0014-shadow-dom-with-constructable-stylesheets.md)).

<!-- snippet: examples/element-embed/index.html#embed -->
```html
<script src="fhirq-element.js"></script>

<fhir-questionnaire src="demo.json"></fhir-questionnaire>
```

- **`fhirq-element.js`** is `@fhirq/element`'s script-tag build. It registers
  `<fhir-questionnaire>` as it loads, and carries the form's styles inside it.
- **`src`** is the questionnaire as R4 JSON. The element makes one `GET` for
  it. Or set the `questionnaire` property to the JSON you already have.
- **The page's policy** can be as strict as `default-src 'self'; script-src
  'self'; style-src 'self'`: the element needs no inline script or style.

With a bundler, import the element instead of the script:
`import '@fhirq/element/define'` registers it.

## Hearing answers and completing

The element renders no submit button: yours calls `requestCompletion()`.
Answers arrive as events on the element, which bubble.

<!-- snippet: docs/examples/src/element.ts#events -->
```ts
form.addEventListener('fhirq-change', (event) => store.draft(event.detail));
form.addEventListener('fhirq-complete', (event) => store.record({ ...event.detail, authored: new Date().toISOString() }));
submit.addEventListener('click', () => form.requestCompletion());
```

- **`fhirq-change`** carries the `QuestionnaireResponse` after each change that
  altered it: a draft.
- **`fhirq-complete`** carries it once the form completes, with `status:
  "completed"`. It has no `authored`: stamp it when you store it, as above.
  While an answer is missing or invalid, completion is refused and the form's
  error summary takes focus instead.
- **`fhirq-error`** says the questionnaire could not be loaded or opened, with
  the error in `detail.error`.

The form stores nothing and sends nothing but the requests you configure: the
`GET` for `src`, and value-set expansions if you set `value-set-base` (see
[value sets](value-sets.md)).

## Where to go next

- The complete page, served and tested in three browsers:
  [`examples/element-embed`](../../examples/element-embed).
- Session options the attributes do not reach (rules, scorers, a sanitizer, a
  restored session) go through the `session` property, with a session you make
  yourself: [`07-api.md` §7](../07-api.md#7-fhirqelement).
