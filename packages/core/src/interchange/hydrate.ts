import { diagnostic, type Diagnostic } from '../kernel/diagnostic.js';
import type { StoredResponse } from '../kernel/response.js';
import type { Definition } from '../definition/compile.js';
import { canonical, type StoredState } from '../session/snapshot.js';
import { decodeItems } from './decode.js';

/**
 * Hydration (`04-domain.md` §8, US-06.1): the stored state a decoded response
 * gives against a loaded definition. Step 1, loading the definition, has
 * happened; steps 4 to 6 happen as the session starts from this state: settle,
 * drop what landed on disabled nodes, enter `in-progress` whatever the stored
 * status (AC-06.1.4, T2). Nothing is surfaced.
 */
export function hydrationState(definition: Definition, stored: StoredResponse): StoredState {
  const decoded = decodeItems(definition, stored.items);
  return {
    instances: decoded.instances,
    answers: decoded.answers,
    surfaced: [],
    status: 'in-progress',
    completionRefused: false,
    cycle: 0,
    diagnostics: [...drift(definition, stored.questionnaire), ...decoded.diagnostics],
    dropDisabled: true,
  };
}

/**
 * Step 2: a stored canonical whose `url` differs from the questionnaire's, or
 * whose version differs, is `version-drift` naming both (AC-06.3.1, M3 plan
 * D6). Reported, never resolved (INV-E-10). A response that names no
 * questionnaire, or no version, cannot drift.
 */
function drift(definition: Definition, stored: string | null): Diagnostic[] {
  if (stored === null) return [];
  const bar = stored.lastIndexOf('|');
  const url = bar === -1 ? stored : stored.slice(0, bar);
  const version = bar === -1 ? null : stored.slice(bar + 1);
  const drifted = url !== definition.url || (version !== null && version !== definition.version);
  const expected = canonical(definition.url, definition.version);
  return drifted ? [diagnostic('version-drift', 'warning', null, { expected, found: stored })] : [];
}
