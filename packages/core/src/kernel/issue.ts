import type { ItemPath } from './path.js';

/**
 * A finding about the respondent's answers (`04-domain.md` §1). The slice knows one rule.
 *
 * @beta
 */
export type IssueCode = 'required';

/**
 * A current problem with a node's answers. Present whether or not it has been
 * surfaced to the respondent; `NodeState.surfaced` says which (SM-03).
 *
 * @beta
 */
export interface Issue {
  readonly code: IssueCode;
  readonly severity: 'error';
  readonly path: ItemPath;
}
