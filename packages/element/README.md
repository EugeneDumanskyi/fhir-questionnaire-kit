# @fhirq/element

`<fhir-questionnaire>`, a custom element that renders a FHIR **R4 (4.0.1)**
`Questionnaire` as an accessible form in shadow DOM, part of the
[FHIR Questionnaire Kit](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/README.md). It needs no framework and no
stylesheet. Its only dependency is
[`@fhirq/core`](https://www.npmjs.com/package/@fhirq/core).

```sh
npm install @fhirq/element
```

Import `@fhirq/element/define` to register the element, or load the
script-tag build, `dist/fhirq-element.js`:

<!-- snippet: examples/element-embed/index.html#embed -->
```html
<script src="fhirq-element.js"></script>

<fhir-questionnaire src="demo.json"></fhir-questionnaire>
```

To hear the answers, listen on the element:

<!-- snippet: docs/examples/src/element.ts#events -->
```ts
form.addEventListener('fhirq-change', (event) => store.draft(event.detail));
form.addEventListener('fhirq-complete', (event) => store.record({ ...event.detail, authored: new Date().toISOString() }));
submit.addEventListener('click', () => form.requestCompletion());
```

- [The element embed example](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/examples/element-embed/README.md)
- [API reference](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/07-api.md)
- [Adoption pack](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/adoption.md): conformance, accessibility, security
  and the dependency inventory

Apache-2.0. See `LICENSE` and `NOTICE`.
