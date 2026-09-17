// MUST FAIL (3): FHIR, validation and the view, including a type-only and a dynamic import.
import type { Questionnaire } from '../fhir/r4/types.js';
import { validateRequired } from '../validation/required.js';

export const later = () => import('../view/view.js');
export const uses: readonly unknown[] = [validateRequired];
export type Input = Questionnaire;
