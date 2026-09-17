// MUST FAIL (1): an engine internal instead of the public API.
import type { Session } from '../session/session.js';

export type Reads = Session;
