import { createSession, type Answer, type VisibleProjection } from '@fhirq/core';

import { collaborating as questionnaire } from './questionnaires.js';

/*
 * Stand-ins for what a host brings: a terminology client, a scoring helper, a
 * FHIRPath engine, a sanitizer such as DOMPurify, and its error reporting.
 * Each is only as real as the example needs.
 */
const FREQUENCY = [
  { system: 'urn:fhirq:docs:frequency', code: '0', display: 'Not at all' },
  { system: 'urn:fhirq:docs:frequency', code: '1', display: 'Several days' },
  { system: 'urn:fhirq:docs:frequency', code: '2', display: 'More than half the days' },
  { system: 'urn:fhirq:docs:frequency', code: '3', display: 'Nearly every day' },
];
const terminology = {
  expand: (valueSet: string, { signal }: { signal: AbortSignal }) =>
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return valueSet === 'urn:fhirq:docs:frequency' ? FREQUENCY : [];
    }),
};
const ordinals = (projection: VisibleProjection) =>
  projection.nodes.flatMap(({ answers }) => answers.flatMap((answer) => (answer.kind === 'coding' ? [Number(answer.value.code)] : [])));
const sumOrdinals = (projection: VisibleProjection) => ordinals(projection).reduce((sum, ordinal) => sum + ordinal, 0);
const fhirpath = (expression: { language: string }, projection: VisibleProjection): Answer | undefined =>
  expression.language === 'text/fhirpath' ? { kind: 'integer', value: ordinals(projection).length } : undefined;
const purify = (xhtml: string) => xhtml.replace(/<(?!\/?b>)[^>]*>/g, '');
export const reported: { error: unknown; code: string }[] = [];
const report = (error: unknown, code: string) => reported.push({ error, code });

// #region collaborators
const session = createSession(questionnaire, {
  resolver: (valueSet, { signal }) => terminology.expand(valueSet, { signal }),
  scorers: { total: { inputs: ['q1', 'q2'], score: (projection) => sumOrdinals(projection) } },
  evaluator: { evaluate: (expression, { projection }) => fhirpath(expression, projection) },
  sanitize: (xhtml) => purify(xhtml),
  onCollaboratorError: (error, diagnostic) => report(error, diagnostic.code),
});
// #endregion

export { session };
