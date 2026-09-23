// MUST FAIL (2): an interchange file other than emit keeps its module's row, which has no session internal,
// and hydration is resume-only, so no other interchange file may import it (ADR-0021).
import type { Store } from '../session/store.js';
import { hydrationState } from './hydrate.js';

export type Reads = Store;
export const uses: readonly unknown[] = [hydrationState];
