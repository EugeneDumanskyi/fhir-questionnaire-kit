// MUST PASS: stands in for the message catalogue itself, which is the one place
// prose is allowed to live (NFR-I-01). The test passes this path as the rule's
// `catalogue` option.

export const en = {
  'validation.required': 'This question must be answered before you continue.',
  'validation.outOfRange': 'Enter a number inside the allowed range.',
} as const;
