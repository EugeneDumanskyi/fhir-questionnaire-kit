import { Questionnaire, useQuestionnaire } from '@fhirq/react';
import { StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { FORMS } from './forms.js';
import { MATRIX_FORMS, type MatrixForm } from './names.js';

/**
 * React's page for the manual screen-reader passes (M8 plan step 10,
 * `docs/accessibility.md`): the form `#root` names, in the default theme,
 * inside a host form whose submit button asks it to complete, as the
 * quickstart does. The page adds no status of its own: the kit announces
 * completion, and a second message would spoil the count the passes take
 * (NFR-A-08).
 */

function Pass({ form }: { readonly form: MatrixForm }): ReactElement {
  const { session } = useQuestionnaire(FORMS[form].form, { options: FORMS[form].options });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        session.dispatch({ type: 'RequestCompletion' });
      }}
    >
      <Questionnaire session={session} />
      <button>Submit</button>
    </form>
  );
}

const container = document.getElementById('root');
const form = MATRIX_FORMS.find((name) => name === container?.dataset['form']);
if (container !== null && form !== undefined)
  createRoot(container).render(
    <StrictMode>
      <Pass form={form} />
    </StrictMode>,
  );
