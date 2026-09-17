/**
 * The S1 slice's messages, in `en` only (decision D3). This is the path the
 * catalogue will occupy; host overrides, fallback and the documented context
 * per key are M4 (NFR-I-01, NFR-I-02).
 *
 * A plural message is keyed by `Intl.PluralRules` category; `{count}` is
 * replaced with the count formatted by `Intl.NumberFormat` (NFR-I-04).
 */
export const en = {
  yes: 'Yes',
  no: 'No',
  requiredMarker: '*',
  issueRequired: 'Answer this question',
  errorSummaryHeading: 'There is a problem',
  /** A summary link names the question as well as the problem (WCAG 2.4.4). */
  errorSummaryEntry: '{message}: {label}',
  announceShown: { one: '{count} question shown.', other: '{count} questions shown.' },
  announceHidden: { one: '{count} question hidden.', other: '{count} questions hidden.' },
  announceIssues: { one: '{count} answer needs attention.', other: '{count} answers need attention.' },
  announceRefused: {
    one: 'The form was not completed. {count} answer needs attention.',
    other: 'The form was not completed. {count} answers need attention.',
  },
  announceCompleted: 'The form is complete.',
} as const;

export type Messages = typeof en;
export type PluralMessage = { readonly one: string; readonly other: string };
