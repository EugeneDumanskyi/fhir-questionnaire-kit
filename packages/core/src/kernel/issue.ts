import type { LinkId } from './item-type.js';
import type { ItemPath } from './path.js';

/**
 * A finding about the respondent's answers (`04-domain.md` §1, BC3): one code
 * per built-in rule, plus `rule` for a host's cross-field rule.
 *
 * @beta
 */
export type IssueCode =
  | 'required'
  | 'min-occurs'
  | 'max-occurs'
  | 'max-length'
  | 'max-decimal-places'
  | 'min-value'
  | 'max-value'
  | 'unit-missing'
  | 'rule';

/**
 * A current problem with the visible answers (AC-04.4.1). Present whether or
 * not it has been surfaced to the respondent; `NodeState.surfaced` says which
 * (SM-03). Serializable, and it never holds an answer value (NFR-X-04, M3 plan
 * D1): the view adds the entered value when it renders.
 *
 * @beta
 */
export interface Issue {
  readonly code: IssueCode;
  readonly severity: 'error' | 'warning';
  /** The node it is about; `null` for a form-level issue (AC-04.3.1). */
  readonly path: ItemPath | null;
  readonly linkId: LinkId | null;
  /** The message catalogue key: the code for a built-in rule, the rule's own key for a cross-field rule (INV-V-10). */
  readonly message: string;
  /** What the message names: the authored limit (`limit`), never the entered value. */
  readonly params: Readonly<Record<string, string | number>>;
}
