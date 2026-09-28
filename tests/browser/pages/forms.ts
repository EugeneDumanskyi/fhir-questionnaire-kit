import type { Questionnaire, SessionOptions } from '@fhirq/core';

import DEMO from '../../../fixtures/demo/questionnaire.json';
import { KINDS, KINDS_OPTIONS } from '../../../packages/element/test/kinds.js';
import type { MatrixForm } from './names.js';

/**
 * The forms M8's gates and passes read (plan D4): the demo, and the element's
 * form of every kind, whose value set fails to load, so both renderers draw
 * the same items and the retry control.
 */
export const FORMS: Readonly<Record<MatrixForm, { readonly form: Questionnaire; readonly options?: SessionOptions }>> = {
  demo: { form: DEMO as Questionnaire },
  kinds: { form: KINDS, options: { ...KINDS_OPTIONS, resolver: () => Promise.reject(new Error('The kinds page has no terminology server')) } },
};
