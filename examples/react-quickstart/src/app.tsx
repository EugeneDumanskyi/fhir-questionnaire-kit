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
