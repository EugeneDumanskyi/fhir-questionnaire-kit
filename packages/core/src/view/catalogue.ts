import type { Issue, IssueCode } from '../index.js';
import { fill } from './format.js';
import { en, type Messages, type PluralMessage } from './messages/en.js';
import type { ViewOptions } from './types.js';

/** Text a person can read: a non-empty string, not blanks. */
const readable = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** The catalogue key of each built-in rule's default text; a cross-field rule without text gets the generic one. */
const ISSUE_KEYS: Readonly<Record<IssueCode, keyof Messages>> = {
  required: 'issueRequired',
  'min-occurs': 'issueMinOccurs',
  'max-occurs': 'issueMaxOccurs',
  'max-length': 'issueMaxLength',
  'max-decimal-places': 'issueMaxDecimalPlaces',
  'min-value': 'issueMinValue',
  'max-value': 'issueMaxValue',
  'unit-missing': 'issueUnitMissing',
  rule: 'issueInvalid',
};

export interface Catalogue extends Messages {
  /** An issue's text, filled with its formatted limit and the entered value (AC-04.2.1, M3 plan D1). */
  readonly issue: (issue: Issue, values: Readonly<Record<string, string>>) => string;
}

/**
 * The catalogue with the host's overrides, key by key (INV-X-08). A key is
 * looked up as an own property only, so no inherited name can answer for it.
 * An issue's own key — its code for a built-in rule, the rule's key for a
 * cross-field rule — is looked up first, then the default for its code.
 */
export function catalogue(overrides: ViewOptions['messages'] = {}): Catalogue {
  const own = (key: string): unknown => (Object.hasOwn(overrides, key) ? overrides[key] : undefined);
  const merged: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(en)) {
    const given = own(key) as Partial<PluralMessage> | undefined;
    const fits = typeof fallback === 'string' ? readable(given) : readable(given?.one) && readable(given?.other);
    merged[key] = fits ? given : fallback;
  }
  const messages = merged as unknown as Messages;
  return {
    ...messages,
    issue: ({ code, message }, values) => {
      const given = own(message);
      return fill(readable(given) ? given : messages[ISSUE_KEYS[code]] as string, values);
    },
  };
}
