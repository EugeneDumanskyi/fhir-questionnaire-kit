// MUST PASS: kernel, the R4 parser only, its own module, and a path outside the root.
import type { LinkId } from '../kernel/ids.js';
import { parseQuestionnaire } from '../fhir/r4/parse.js';
import { tarjan } from './scc.js';
import { outside } from '../../../outside.js';

export const uses: readonly unknown[] = [parseQuestionnaire, tarjan, outside];
export type Id = LinkId;
