import type { RetentionPolicy } from './enablement.js';
import type { Store } from './store.js';

/**
 * The session state registry (ADR-0021): each session's stored state, keyed by
 * the public `Session` object, so the resume path can snapshot it without a
 * method on the session. Exported from no entry point; lint lets only
 * `session/session` and `session/snapshot` import it (`05-architecture.md`
 * §4.1). This is the second door into stored state, and the only one that
 * reaches retained answers.
 */
export interface Stored {
  readonly store: Store;
  readonly retention: RetentionPolicy;
  readonly status: () => 'in-progress' | 'completed';
  readonly completionRefused: () => boolean;
  readonly cycle: () => number;
}

const registry = new WeakMap<object, Stored>();

export function register(session: object, stored: Stored): void {
  registry.set(session, stored);
}

export function storedState(session: object): Stored | undefined {
  return registry.get(session);
}
