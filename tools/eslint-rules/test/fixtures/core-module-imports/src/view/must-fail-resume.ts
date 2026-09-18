// MUST FAIL (2): nothing reachable from view may import the resume path (ADR-0021).
import { restoreSession } from '../resume.js';
import { readSnapshot } from '../session/snapshot.js';

export const uses: readonly unknown[] = [restoreSession, readSnapshot];
