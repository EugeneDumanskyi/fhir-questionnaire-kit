// MUST PASS: the resume entry point imports the snapshot, hydration, the codec and the public API.
import type { Session } from './index.js';
import { open } from './open.js';
import { decodeResponse } from './fhir/r4/decode.js';
import { hydrationState } from './interchange/hydrate.js';
import { restore } from './session/snapshot.js';

export type Returns = Session;
export const uses: readonly unknown[] = [open, decodeResponse, hydrationState, restore];
