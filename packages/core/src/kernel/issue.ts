import type { ItemPath } from './path.js';

/** A finding about the respondent's answers (`04-domain.md` §1). The slice knows one rule. */
export type IssueCode = 'required';

export interface Issue {
  readonly code: IssueCode;
  readonly severity: 'error';
  readonly path: ItemPath;
}
