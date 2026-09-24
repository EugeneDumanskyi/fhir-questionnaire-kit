# React quickstart

A FHIR R4 `Questionnaire` rendered as an accessible form, completed with the
host's own submit button.

```sh
npm install @fhirq/react @fhirq/themes react react-dom
```

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

- `intake` is the questionnaire, as R4 JSON: [`src/intake.ts`](src/intake.ts).
  It is a module rather than a `.json` file, because TypeScript widens an
  imported JSON file's `resourceType` to `string`.
- Submitting asks the form to complete. While an answer is missing or
  invalid, completion is refused: the form lists the problems and moves focus
  to that list. Once it completes, `onComplete` gets the
  `QuestionnaireResponse`, without `authored`; stamp that when you store it.
- The form fetches nothing and stores nothing. Saving the response is up to you.

The code above is [`src/app.tsx`](src/app.tsx), verbatim. CI typechecks it,
renders it in Node on React 18 and 19, then hydrates and completes it in
Chromium and WebKit. It is 13 lines, counting every line that is not blank;
NFR-U-01's target is 10.
