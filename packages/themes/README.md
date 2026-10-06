# @fhirq/themes

The stylesheets of the [FHIR Questionnaire Kit](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/README.md).
`base.css` styles the form's structure and reads only `--fhirq-*` custom
properties. `default.css` is a preset that gives every token a value, light
and dark. To restyle the form, set the tokens.

```sh
npm install @fhirq/themes
```

<!-- snippet: examples/react-quickstart/src/render.tsx -->
```tsx
import { Questionnaire } from '@fhirq/react';
import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';
import { intake } from './intake.js';

export const Form = () => <Questionnaire questionnaire={intake} />;
```

`@fhirq/element` already embeds both stylesheets. Set the tokens on the
element to restyle it, as in
[the themed host example](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/examples/themed-host/README.md).

- [The tokens and the DOM contract](https://github.com/EugeneDumanskyi/fhir-questionnaire-kit/blob/main/docs/07-api.md)

Apache-2.0. See `LICENSE` and `NOTICE`.
