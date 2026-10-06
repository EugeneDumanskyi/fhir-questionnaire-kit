# @fhirq/core

The engine of the [FHIR Questionnaire Kit](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/README.md): it loads a FHIR
**R4 (4.0.1)** `Questionnaire` and holds everything the specification says
about filling it in. That covers conditions (`enableWhen`), nested and
repeating groups, validation, scoring, save and resume, and answer retention.
It then emits a valid `QuestionnaireResponse`. It touches no DOM, network,
storage or timers, and it has no dependencies.

```sh
npm install @fhirq/core
```

<!-- snippet: docs/examples/src/session.ts#create -->
```ts
import { createSession, itemPath } from '@fhirq/core';

const session = createSession(questionnaire, { loadMode: 'strict', retention: 'retain-exclude' });
session.subscribe(() => render(session.getSnapshot()));
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
```

`@fhirq/core/view` is the presentation model: what to draw, with labels,
controls, ARIA ids and messages decided, for a renderer of your own.

<!-- snippet: docs/examples/src/headless.ts#headless -->
```ts
import { createView, type ViewNode } from '@fhirq/core/view';

const view = createView(createSession(questionnaire), { idPrefix: 'intake', locale: 'en' });

/** A host's own renderer, here to plain lines: each question's label, its required marker, and its issues. */
const draw = (nodes: readonly ViewNode[], marker: string): string[] =>
  nodes.map((node) => [node.label, node.required ? marker : '', ...node.issues.map((issue) => issue.message)].filter(Boolean).join(' '));

const lines = draw(view.getSnapshot().nodes, view.getSnapshot().requiredMarker);
```

`@fhirq/core/resume` restores a saved session. The renderers are
[`@fhirq/react`](https://www.npmjs.com/package/@fhirq/react) and
[`@fhirq/element`](https://www.npmjs.com/package/@fhirq/element).

- [API reference](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/07-api.md)
- [Adoption pack](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/adoption.md): conformance, accessibility, security
  and the dependency inventory

Apache-2.0. See `LICENSE` and `NOTICE`.
