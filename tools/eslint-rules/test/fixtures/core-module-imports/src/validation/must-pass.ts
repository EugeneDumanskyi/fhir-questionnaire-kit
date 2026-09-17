// MUST PASS: the projection is the one door into session state.
import type { VisibleProjection } from '../session/projection.js';
import type { Definition } from '../definition/compile.js';
import type { ItemPath } from '../kernel/path.js';

export type Reads = [VisibleProjection, Definition, ItemPath];
