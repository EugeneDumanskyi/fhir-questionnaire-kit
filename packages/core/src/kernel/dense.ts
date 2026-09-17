/**
 * Reads a table slot by dense id. The engine's tables are indexed by ids it
 * assigned itself (`0 … n-1`, ADR-0009), so a slot is present by construction;
 * `noUncheckedIndexedAccess` cannot know that. Routing every such read through
 * here keeps a defensive `?? fallback` from being scattered over the graph
 * code, where it would read as a case that happens and never be exercised.
 */
export function slot<T>(table: readonly T[], id: number): T {
  return table[id] as T;
}
