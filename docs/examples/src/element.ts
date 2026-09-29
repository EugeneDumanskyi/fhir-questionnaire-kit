import type { QuestionnaireResponse } from '@fhirq/core';
import type { FhirQuestionnaireElement } from '@fhirq/element';

/** Stand-ins for the host's own storage. */
export interface Store {
  readonly draft: (response: QuestionnaireResponse) => void;
  readonly record: (response: QuestionnaireResponse) => void;
}

/** `form` is the `<fhir-questionnaire>` on the page, `submit` the host's own button. */
export function wire(form: FhirQuestionnaireElement, submit: HTMLButtonElement, store: Store): void {
  // #region events
  form.addEventListener('fhirq-change', (event) => store.draft(event.detail));
  form.addEventListener('fhirq-complete', (event) => store.record({ ...event.detail, authored: new Date().toISOString() }));
  submit.addEventListener('click', () => form.requestCompletion());
  // #endregion
}
