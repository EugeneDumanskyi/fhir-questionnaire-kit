/**
 * The message catalogue's built-in `en` defaults (NFR-I-01, NFR-I-03, US-07.4).
 * A host overrides any key through `ViewOptions.messages`; a key it leaves out,
 * or gives an empty or wrongly shaped value, falls back to the text here, key
 * by key (INV-X-08). NFR-I-02 caps the catalogue at 45 keys, each with its
 * context documented beside it.
 *
 * `{name}` placeholders are filled by the view: `{count}`, `{limit}` and
 * `{value}` with numbers and dates formatted by `Intl` in the host's locale
 * (NFR-I-04). A plural message is keyed by `Intl.PluralRules` category.
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
  /** Too few answers or repeat instances. `{limit}` is the minimum, `{value}` how many there are. */
  issueMinOccurs: 'Give at least {limit}. There are {value}.',
  /** Too many answers or repeat instances, reachable only from stored data (T9). `{limit}` is the maximum. */
  issueMaxOccurs: 'Give no more than {limit}. There are {value}.',
  /** Text over `maxLength`. `{limit}` is the maximum, `{value}` the number of characters entered. */
  issueMaxLength: 'Use {limit} characters or fewer. You used {value}.',
  /** A number with more decimal places than allowed. `{limit}` is the maximum, `{value}` the number entered. */
  issueMaxDecimalPlaces: 'Decimal places allowed: {limit}. You entered {value}.',
  /** Below `minValue`. `{limit}` is the minimum and `{value}` the answer, both formatted. */
  issueMinValue: 'Enter {limit} or more. You entered {value}.',
  /** Above `maxValue`. `{limit}` is the maximum and `{value}` the answer, both formatted. */
  issueMaxValue: 'Enter {limit} or less. You entered {value}.',
  /** A quantity with a value and no unit (AC-01.2.4). */
  issueUnitMissing: 'Choose a unit',
  /** Typed text that is not a date (INV-P-06): the entry form is FHIR's, at year, month or day precision. */
  issueNotADate: 'Enter a real date, like 2024-05-01, 2024-05 or 2024',
  /** Typed text that is not a number, or not a whole one where the question wants one (INV-P-06). */
  issueNotANumber: 'Enter a number, like 12 or 0.5',
  /** Heading of the error summary shown after a refused completion. */
  errorSummaryHeading: 'There is a problem',
  /** A summary link names the question as well as the problem (WCAG 2.4.4). `{label}` is the question, `{message}` the issue. */
  errorSummaryEntry: '{label}: {message}',
  /** Names one repeat instance (AC-11.2.1). `{label}` is the group's label, `{count}` the instance's position. */
  instanceLabel: '{label} {count}',
  /** The control that adds a repeat instance. `{label}` is the group's label. */
  addInstance: 'Add {label}',
  /** The control that removes a repeat instance. `{label}` is the instance's name. */
  removeInstance: 'Remove {label}',
  /** Why the add control is inert at `maxOccurs` (INV-P-04). `{count}` is the maximum. */
  atMaxOccurs: { one: 'You can add only {count}.', other: 'You can add up to {count}.' },
  /** Announced when a cycle shows questions. */
  announceShown: { one: '{count} question shown.', other: '{count} questions shown.' },
  /** Announced when a cycle hides questions. */
  announceHidden: { one: '{count} question hidden.', other: '{count} questions hidden.' },
  /** Announced when a repeat instance is added. */
  announceAdded: { one: '{count} section added.', other: '{count} sections added.' },
  /** Announced when a repeat instance is removed. */
  announceRemoved: { one: '{count} section removed.', other: '{count} sections removed.' },
  /** Announced when leaving questions surfaces their issues. */
  announceIssues: { one: '{count} answer needs attention.', other: '{count} answers need attention.' },
  /** Announced when a completion is refused. */
  announceRefused: {
    one: 'The form was not completed. {count} answer needs attention.',
    other: 'The form was not completed. {count} answers need attention.',
  },
  /** Announced when the form completes. */
  announceCompleted: 'The form is complete.',
  /** Announced on its own when looked-up options arrive (T12). `{count}` is how many visible questions got them. */
  announceOptionsLoaded: { one: 'Choices loaded for {count} question.', other: 'Choices loaded for {count} questions.' },
  /** Announced on its own when a lookup fails (T12). */
  announceOptionsFailed: { one: 'Choices could not be loaded for {count} question.', other: 'Choices could not be loaded for {count} questions.' },
  /** A question whose options are still being looked up (SM-04 `pending`). */
  optionsPending: 'Loading the choices',
  /** A question whose options could not be looked up (SM-04 `failed`, AC-07.1.2). */
  optionsFailed: 'The choices could not be loaded',
  /** A question whose options the form cannot look up: the host gave no resolver (SM-04 `unresolved`). */
  optionsUnavailable: 'The choices are not available',
  /** The action that looks the options up again (`RetryOptions`). */
  optionsRetry: 'Try again',
  /** The empty entry of a collapsed choice, before anything is chosen. */
  optionsChoose: 'Choose an answer',
  /** Names an open-choice question's free-text answer (AC-01.2.3). */
  other: 'Other',
  /** Names a quantity's unit. */
  unit: 'Unit',
  /** A calculated value or score that has no value: its evaluator or scorer failed or returned nothing (ADR-0006 option C). */
  scoreUnavailable: 'Score unavailable',
  /** Stands in for an item the form cannot show, in lenient mode (AC-01.3.2). */
  unsupported: 'This question cannot be shown here',
} as const;

export type PluralMessage = { readonly one: string; readonly other: string };

/** The catalogue's shape: every key of `en`, each a string or a plural message as its default is. */
export type Messages = { readonly [K in keyof typeof en]: (typeof en)[K] extends string ? string : PluralMessage };
