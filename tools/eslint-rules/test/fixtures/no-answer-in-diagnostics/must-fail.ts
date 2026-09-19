import { diagnostic, FhirqError, type Answer } from './answer';

declare const answer: Answer;
declare const answers: readonly Answer[];
declare const console: { warn(...data: unknown[]): void; log(...data: unknown[]): void };

// Interpolated into a detail: the respondent's text becomes log text.
diagnostic('quarantined-answer', 'warning', 'q', { detail: `bad value ${answer.value}` });
// Concatenated.
diagnostic('orphan-answer', 'warning', 'q', { found: 'got ' + String(answer.value) });
// A narrowed answer is still an answer.
if (answer.kind === 'coding') diagnostic('orphan-answer', 'warning', answer.value.code ?? null);
// Into an error's findings.
throw new FhirqError('invalid-options', [diagnostic('malformed', 'warning', null, { detail: JSON.stringify(answers) })]);
// To the console.
console.warn('refused', answer);
