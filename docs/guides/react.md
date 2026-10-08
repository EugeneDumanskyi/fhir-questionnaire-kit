# React quickstart

A FHIR R4 `Questionnaire` as an accessible form in a React 18 or 19 app,
completed by your own submit button.

```sh
npm install @fhirq/react @fhirq/themes react react-dom
```

<!-- snippet: examples/react-quickstart/src/app.tsx -->
```tsx
import { Questionnaire, useQuestionnaire, type QuestionnaireProps } from '@fhirq/react';
import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';
import { intake } from './intake.js';

export function Intake({ onComplete }: Pick<QuestionnaireProps, 'onComplete'>) {
  const { session } = useQuestionnaire(intake, { onComplete });
  return (
    <form onSubmit={(event) => { event.preventDefault(); session.dispatch({ type: 'RequestCompletion' }); }}>
      <Questionnaire session={session} />
      <button>Submit</button>
    </form>
  );
}
```

- **`intake`** is the questionnaire as R4 JSON
  ([`src/intake.ts`](../../examples/react-quickstart/src/intake.ts)). Load it
  however you like; the form fetches nothing.
- **`useQuestionnaire`** creates the session and owns it for the component's
  life. It reads the questionnaire once, so a different questionnaire needs a
  different component, by `key` ([ADR-0001](../adr/0001-questionnaire-fixed-per-session.md)).
- **Submitting** dispatches `RequestCompletion`. While an answer is missing or
  invalid, completion is refused: the form lists the problems and moves focus
  to that list. Once it completes, `onComplete` gets the
  `QuestionnaireResponse` without `authored`: stamp it when you store it.
- **The two stylesheets** are the structure (`base.css`) and the default
  token values (`default.css`). To restyle, set tokens; see
  [the tiers](tiers.md).

## Hearing every change

`onChange` gets the response after each change that altered it, for a
draft you save as the respondent goes. Pass `value` to open the form on a
stored response instead of an empty one; see [save and resume](save-and-resume.md).

## Server rendering

The hook reads through `useSyncExternalStore` with the same snapshot on the
server and the client, and ids come from React's `useId`, so the form renders
on a server and hydrates without a mismatch. A resolver is never called while
rendering: value sets are `pending` on the server and in the first client
render, and resolve once the component has mounted
([ADR-0015](../adr/0015-react-adapter-session-ownership-and-ssr.md)).

## Where to go next

- The complete example, with its test:
  [`examples/react-quickstart`](../../examples/react-quickstart).
- Every option of the hook and the component: [`07-api.md` §6](../07-api.md#6-fhirqreact).
