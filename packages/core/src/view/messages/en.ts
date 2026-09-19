/**
 * The message catalogue's built-in `en` defaults (NFR-I-01, NFR-I-03, US-07.4).
 * A host overrides any key through `ViewOptions.messages`; a key it leaves out,
 * or gives an empty or wrongly shaped value, falls back to the text here, key
 * by key (INV-X-08). NFR-I-02 caps the catalogue at 45 keys, each with its
 * context documented beside it.
 *
 * A plural message is keyed by `Intl.PluralRules` category; `{count}` is
 * replaced with the count formatted by `Intl.NumberFormat` (NFR-I-04).
 */
export const en = {
  /** The true choice of a yes/no question. */
  yes: 'Yes',
  /** The false choice of a yes/no question. */
  no: 'No',
  /** Shown beside the label of a required question. */
  requiredMarker: '*',
  /** A required question left unanswered. Also the text for the `required` issue key. */
  issueRequired: 'Answer this question',
  /** Any other issue, including a cross-field rule whose message key the host has not given text for. */
  issueInvalid: 'Check this answer',
  /** Heading of the error summary shown after a refused completion. */
  errorSummaryHeading: 'There is a problem',
  /** A summary link names the question as well as the problem (WCAG 2.4.4). `{message}` is the issue, `{label}` the question. */
  errorSummaryEntry: '{message}: {label}',
  /** Announced when a cycle shows questions. */
  announceShown: { one: '{count} question shown.', other: '{count} questions shown.' },
  /** Announced when a cycle hides questions. */
  announceHidden: { one: '{count} question hidden.', other: '{count} questions hidden.' },
  /** Announced when leaving questions surfaces their issues. */
  announceIssues: { one: '{count} answer needs attention.', other: '{count} answers need attention.' },
  /** Announced when a completion is refused. */
  announceRefused: {
    one: 'The form was not completed. {count} answer needs attention.',
    other: 'The form was not completed. {count} answers need attention.',
  },
  /** Announced when the form completes. */
  announceCompleted: 'The form is complete.',
  /** A question whose options are still being looked up (SM-04 `pending`). */
  optionsPending: 'Loading the choices',
  /** A question whose options could not be looked up (SM-04 `failed`, AC-07.1.2). */
  optionsFailed: 'The choices could not be loaded',
  /** The action that looks the options up again (`RetryOptions`). */
  optionsRetry: 'Try again',
  /** A score that has no value: its scorer failed or returned nothing (ADR-0006 option C). */
  scoreUnavailable: 'Score unavailable',
} as const;

export type PluralMessage = { readonly one: string; readonly other: string };

/** The catalogue's shape: every key of `en`, each a string or a plural message as its default is. */
export type Messages = { readonly [K in keyof typeof en]: (typeof en)[K] extends string ? string : PluralMessage };
