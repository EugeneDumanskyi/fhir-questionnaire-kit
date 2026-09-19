import { diagnostic, FhirqError, type Answer } from './answer';

declare const answer: Answer;
declare const answers: readonly Answer[];
declare const path: string;

// Kinds, counts and paths are what hydration diagnostics name (INV-E-09).
diagnostic('quarantined-answer', 'warning', path, { detail: 'too-many-answers', found: answer.kind });
diagnostic('quarantined-answer', 'warning', path, { found: String(answers.length) });
diagnostic('quarantined-answer', 'warning', path, { found: answers.map((entry) => entry.kind).join('|') });
// A function that reads answers is not itself a value.
diagnostic('rule-threw', 'warning', null, { detail: `rules[${[answer].filter((entry) => entry.kind === 'string').length}]` });
throw new FhirqError('invalid-options');
