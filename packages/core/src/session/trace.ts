import type { ItemPath } from '../kernel/path.js';

/**
 * The recompute trace (ADR-0009, NFR-P-09): the paths the settle heap popped
 * in a session's most recent cycle that settled anything. Internal: tests
 * import this module by relative path, and nothing public exposes it
 * (M2 plan D12).
 */
const traces = new WeakMap<object, readonly ItemPath[]>();

export function recordTrace(session: object, recomputed: readonly ItemPath[]): void {
  traces.set(session, recomputed);
}

export function recomputeTrace(session: object): readonly ItemPath[] {
  return traces.get(session) ?? [];
}
