// A server component: the engine runs on the server, and the form renders in
// the client component beside it.
import { createSession, emitResponse } from '@fhirq/core';

import questionnaire from '../questionnaire.json';
import { Form } from './form.js';

export default function Page() {
  const response = emitResponse(createSession(questionnaire));
  return (
    <>
      <p id="server">{`${response.resourceType} ${response.status}`}</p>
      <main id="react">
        <Form />
      </main>
    </>
  );
}
