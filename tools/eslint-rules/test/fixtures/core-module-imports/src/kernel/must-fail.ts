// MUST FAIL (1): the shared kernel imports nothing.
import type { Store } from '../session/store.js';

export type Kernel = Store;
