# @fhirq/react

React 18 and 19 hooks and a default UI for the
[FHIR Questionnaire Kit](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/README.md). It renders a FHIR **R4 (4.0.1)**
`Questionnaire` as an accessible form over
[`@fhirq/core`](https://www.npmjs.com/package/@fhirq/core), its only
dependency.

```sh
npm install @fhirq/react @fhirq/themes react react-dom
```

<!-- snippet: examples/react-quickstart/src/render.tsx -->
```tsx
import { Questionnaire } from '@fhirq/react';
import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';
import { intake } from './intake.js';

export const Form = () => <Questionnaire questionnaire={intake} />;
```

To complete the form with your own submit button and receive the
`QuestionnaireResponse`, use the hook, as in
[the React quickstart](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/examples/react-quickstart/README.md).

- [API reference](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/07-api.md)
- [Adoption pack](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/adoption.md): conformance, accessibility, security
  and the dependency inventory

Apache-2.0. See `LICENSE` and `NOTICE`.
