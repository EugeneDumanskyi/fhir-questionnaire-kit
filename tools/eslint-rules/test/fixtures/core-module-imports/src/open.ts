// MUST FAIL (2): the session opener reads the parser, never emission or the view.
import { emit } from './interchange/emit.js';
import type { View } from './view/view.js';

export const uses: readonly unknown[] = [emit];
export type Shows = View;
