import { diagnostic, type Diagnostic } from '../kernel/diagnostic.js';

/**
 * The one way host code runs during a cycle (BC5, ADR-0006, INV-X-09): rules,
 * scorers and the evaluator are called through `call`. A throw is caught, the
 * cycle goes on, and the finding — which names the collaborator, never the
 * thrown text (NFR-X-04) — is reported once per session, so a collaborator
 * that fails on every keystroke cannot grow the diagnostics without bound. The
 * thrown value goes to the host's `onCollaboratorError` verbatim, in memory
 * (AC-07.1.2, AC-07.2.4), and never into state, which stays serializable.
 *
 * While host code runs, `busy` is true and the session refuses any command
 * (ADR-0009): a rule, scorer or evaluator is pure.
 */
export interface Collaborators {
  /** `every` reports each failure rather than the first: a resolver's, which fails once per call (M4 plan D7). */
  readonly call: <T>(finding: Diagnostic, run: () => T, every?: boolean) => { readonly value: T } | null;
  readonly once: (finding: Diagnostic) => void;
  /** Reports `finding`, and hands `error` to the host's handler every time. */
  readonly fail: (error: unknown, finding: Diagnostic, every?: boolean) => void;
  readonly busy: () => boolean;
}

export function collaborators(report: (finding: Diagnostic) => void, onError: unknown): Collaborators {
  const seen = new Set<string>();
  let depth = 0;
  const once = (finding: Diagnostic): void => {
    const key = `${finding.code} ${finding.path} ${finding.detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    report(finding);
  };
  const fail = (error: unknown, finding: Diagnostic, every = false): void => {
    if (every) report(finding);
    else once(finding);
    if (typeof onError !== 'function') return;
    try {
      (onError as (error: unknown, finding: Diagnostic) => void)(error, finding);
    } catch {
      report(diagnostic('listener-threw', 'warning', null));
    }
  };
  const call = <T>(finding: Diagnostic, run: () => T, every = false): { readonly value: T } | null => {
    let outcome: { readonly value: T } | { readonly error: unknown };
    depth += 1;
    try {
      outcome = { value: run() };
    } catch (error) {
      outcome = { error };
    } finally {
      depth -= 1;
    }
    if ('value' in outcome) return outcome;
    fail(outcome.error, finding, every);
    return null;
  };
  return { call, once, fail, busy: () => depth > 0 };
}
