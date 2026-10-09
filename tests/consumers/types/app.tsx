import type { Questionnaire as Definition } from '@fhirq/core';
import type { FhirQuestionnaireElement } from '@fhirq/element';
import { Questionnaire, useQuestionnaire, type QuestionnaireProps } from '@fhirq/react';
import '@fhirq/element/define';
import '@fhirq/themes/base.css';
import '@fhirq/themes/default.css';

export function Intake({ questionnaire, onComplete }: { questionnaire: Definition } & Pick<QuestionnaireProps, 'onComplete'>) {
  const { session } = useQuestionnaire(questionnaire, { onComplete });
  return (
    <form onSubmit={(event) => { event.preventDefault(); session.dispatch({ type: 'RequestCompletion' }); }}>
      <Questionnaire session={session} />
      <button>Submit</button>
    </form>
  );
}

export function embed(questionnaire: Definition): FhirQuestionnaireElement {
  const element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
  element.questionnaire = questionnaire;
  element.addEventListener('fhirq-complete', (event) => console.log(event.detail.resourceType));
  return element;
}
