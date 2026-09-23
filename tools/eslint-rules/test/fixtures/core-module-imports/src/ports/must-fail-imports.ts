// MUST FAIL (1): a port may name kernel types only, even in a type-only import.
import type { Store } from '../session/store.js';

export type Reads = Store;
