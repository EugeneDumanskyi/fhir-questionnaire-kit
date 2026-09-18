// MUST FAIL (2): emission reaches answers through the projection only (AC-05.3.2):
// not a session internal by its file row, and not the snapshot, which only the resume path imports.
import type { Store } from '../session/store.js';
import { takeSnapshot } from '../session/snapshot.js';

export type Reads = Store;
export const saves = takeSnapshot;
