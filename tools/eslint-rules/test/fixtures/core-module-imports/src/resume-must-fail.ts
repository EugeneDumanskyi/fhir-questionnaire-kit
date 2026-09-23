// MUST FAIL (2), under resume's row: the resume entry point never reaches the view or a port.
import { createView } from './view/view.js';
import type { OptionResolver } from './ports/index.js';

export const uses: readonly unknown[] = [createView];
export type Resolves = OptionResolver;
