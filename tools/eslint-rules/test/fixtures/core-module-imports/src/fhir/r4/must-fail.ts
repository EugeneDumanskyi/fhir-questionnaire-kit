// MUST FAIL (1): the codec depends on the kernel only, never on the engine.
import type { Definition } from '../../definition/compile.js';
import type { LinkId } from '../../kernel/ids.js';

export type Reads = [Definition, LinkId];
