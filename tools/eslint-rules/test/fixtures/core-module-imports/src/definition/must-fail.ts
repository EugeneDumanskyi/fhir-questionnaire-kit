// MUST FAIL (3): R4 shapes other than the parser, session state, validation.
import type { QuestionnaireItem } from '../fhir/r4/types.js';
import { createStore } from '../session/store.js';

export * from '../validation/rules.js';
export const uses: readonly unknown[] = [createStore];
export type Item = QuestionnaireItem;
