/**
 * A finding about the questionnaire, a stored response or the integration
 * (`04-domain.md` §1). Its audience is the integrator. It never carries an
 * answer value (NFR-X-04, INV-D-10): codes, paths and authored names only.
 */

/**
 * `error` for a finding that rejects a `strict` load, `warning` for one that
 * never does, `info` for a remark.
 *
 * @beta
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * Load findings, one code per invariant, plus the runtime ones. A finding that
 * rejects the load in `strict` mode is `error` in both modes, so a lenient
 * host can tell a degraded item from a mere remark; the rest are `warning`.
 *
 * @beta
 */
export type DiagnosticCode =
  /* INV-D-01: not an R4 Questionnaire, or an R4 rule-severity constraint broken. */
  | 'not-a-questionnaire'
  | 'not-r4'
  | 'malformed'
  | 'modifier-extension'
  | 'r4-constraint'
  /* INV-D-02 … INV-D-07 */
  | 'duplicate-link-id'
  | 'unsupported-item-type'
  | 'dangling-condition'
  | 'dependency-cycle'
  | 'meaningless-condition'
  | 'nesting-too-deep'
  | 'chain-too-deep'
  /* INV-D-09, INV-D-13 … INV-D-20 */
  | 'no-evaluator'
  | 'condition-crosses-repeat'
  | 'condition-on-calculated'
  | 'unsupported-extension'
  | 'context-extension-ignored'
  | 'missing-enable-behavior'
  | 'items-under-question'
  | 'initial-value-ignored'
  | 'unsupported-option-type'
  | 'inapplicable-constraint'
  /* Runtime (INV-V-05) */
  | 'listener-threw'
  | 'rule-threw'
  /* Hydration (`04-domain.md` §8, INV-E-08 … E-10) */
  | 'version-drift'
  | 'orphan-answer'
  | 'quarantined-answer'
  | 'hydrated-answer-disabled';

/**
 * A finding about the questionnaire, or a runtime one such as a listener that
 * threw. Codes and paths only (NFR-X-04).
 *
 * @beta
 */
export interface Diagnostic {
  /** Which rule: one code per invariant. */
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  /**
   * Where: the `linkId`s from the root to the item at fault, percent-encoded
   * and joined by `/` as in an item path, but without ordinals, because a
   * definition has none. `null` for the questionnaire as a whole.
   */
  readonly path: string | null;
  /** Other `linkId`s the finding names: every member of a cycle, a condition's question. */
  readonly related: readonly string[];
  /**
   * The authored name involved, when there is one: an unsupported item type, an
   * extension URL, an R4 constraint key, an operator. Never an answer value.
   */
  readonly detail: string | null;
  /**
   * Hydration and restore only (INV-E-09): what the questionnaire expects — an
   * answer kind, a canonical, an answer count. Never a stored value.
   */
  readonly expected?: string;
  /** What the stored response or snapshot has instead, in the same terms. Never a stored value. */
  readonly found?: string;
}

export function diagnostic(
  code: DiagnosticCode,
  severity: Severity,
  path: string | null,
  extra: { readonly related?: readonly string[]; readonly detail?: string; readonly expected?: string; readonly found?: string } = {},
): Diagnostic {
  const { related = [], detail = null, expected, found } = extra;
  return { code, severity, path, related, detail, ...(expected === undefined ? {} : { expected }), ...(found === undefined ? {} : { found }) };
}
