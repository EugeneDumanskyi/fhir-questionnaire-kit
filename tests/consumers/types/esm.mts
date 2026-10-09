import { createSession, emitResponse, type Questionnaire, type QuestionnaireResponse } from '@fhirq/core';
import { restoreSession, snapshot } from '@fhirq/core/resume';
import { createView, type ViewModel } from '@fhirq/core/view';
import { Questionnaire as Form, useQuestionnaire } from '@fhirq/react';
import { defineQuestionnaireElement, FhirQuestionnaireElement } from '@fhirq/element';
import { TOKENS } from '@fhirq/themes';

export function respond(questionnaire: Questionnaire): QuestionnaireResponse {
  return emitResponse(restoreSession(questionnaire, snapshot(createSession(questionnaire))));
}

export function serve(questionnaire: Questionnaire): ViewModel {
  const session = createSession(questionnaire);
  return createView(session, { idPrefix: 'esm', locale: 'en' }).getSnapshot();
}

export const parts = [Form, useQuestionnaire, defineQuestionnaireElement, FhirQuestionnaireElement, TOKENS[0]] as const;
