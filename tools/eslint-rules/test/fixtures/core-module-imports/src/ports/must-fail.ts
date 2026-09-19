// `ports/` is types only (05-architecture.md §4.1): each statement below emits JavaScript.
import { itemPath } from '../kernel/path';
import type { Answer } from '../kernel/answer';

export const DEFAULT_TIMEOUT = 5000;

export function resolveLater(): Promise<readonly Answer[]> {
  return Promise.resolve([]);
}

export type Path = ReturnType<typeof itemPath>;
