// MUST PASS: hydration is one of the snapshot's named importers, and the only importer of decode.
import { startFrom } from '../session/snapshot.js';
import { decodeItems } from './decode.js';

export const uses: readonly unknown[] = [startFrom, decodeItems];
