// MUST PASS: the public engine API and the kernel.
import type { Session } from '../index.js';
import type { ItemPath } from '../kernel/path.js';

export type Reads = [Session, ItemPath];
