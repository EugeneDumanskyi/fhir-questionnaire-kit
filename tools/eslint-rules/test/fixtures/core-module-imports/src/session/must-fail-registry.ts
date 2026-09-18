// MUST FAIL (1): the state registry is open to session/session and session/snapshot only, even inside session/.
import { storedState } from './registry.js';

export const reads = storedState;
