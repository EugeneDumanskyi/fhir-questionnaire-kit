// MUST FAIL (3), under index's row: the main entry point reaches none of the resume path.
import { restoreSession } from './resume.js';
import { decodeItems } from './interchange/decode.js';
import { decodeResponse } from './fhir/r4/decode.js';

export const uses: readonly unknown[] = [restoreSession, decodeItems, decodeResponse];
