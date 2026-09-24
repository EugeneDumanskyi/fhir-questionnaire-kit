/**
 * `@fhirq/react` — the React adapter (ADR-0015): a headless hook over the
 * presentation model, and the default UI built on it alone.
 */
export { createSession } from '@fhirq/core';
export { useQuestionnaire } from './hook.js';
export { Questionnaire, type QuestionnaireProps } from './questionnaire.js';
