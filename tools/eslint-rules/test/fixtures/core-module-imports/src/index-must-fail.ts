// MUST FAIL (2), under index's row: the main entry point reaches validation through open, and the view has its own entry.
import { validate } from './validation/validate.js';
import { createView } from './view/view.js';

export const uses: readonly unknown[] = [validate, createView];
