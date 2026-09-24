import type { Answer, Questionnaire, QuestionnaireResponse, Session, SessionOptions } from '@fhirq/core';
import { hydrateSession } from '@fhirq/core/resume';

const CALCULATED = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression';
const UNIT = 'http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption';
const MAX_VALUE = 'http://hl7.org/fhir/StructureDefinition/maxValue';
const UCUM = 'http://unitsofmeasure.org';

const calculated = (expression: string) => ({ url: CALCULATED, valueExpression: { language: 'text/fhirpath', expression } });

/**
 * ADR-0020's SSR fixture: dates at each authored precision, a `dateTime` with
 * an offset, decimals and quantities, as answers the respondent gave and as
 * calculated values the default UI shows formatted, and limits an issue names
 * formatted. Every string the view formats here must come out the same
 * whatever timezone the process runs in, so a server in one zone and a
 * client in another agree.
 */
export const FORMATS = {
  resourceType: 'Questionnaire',
  status: 'draft',
  item: [
    { linkId: 'born', type: 'date', text: 'Born' },
    { linkId: 'seen', type: 'dateTime', text: 'Seen', extension: [{ url: MAX_VALUE, valueDateTime: '2024-04-30T00:00:00Z' }] },
    { linkId: 'height', type: 'decimal', text: 'Height' },
    { linkId: 'weight', type: 'quantity', text: 'Weight', extension: [{ url: UNIT, valueCoding: { system: UCUM, code: 'kg', display: 'kg' } }] },
    { linkId: 'next-day', type: 'date', text: 'Next visit', extension: [calculated('next-day')] },
    { linkId: 'next-month', type: 'date', text: 'Next review', extension: [calculated('next-month')] },
    { linkId: 'next-year', type: 'date', text: 'Next audit', extension: [calculated('next-year')] },
    { linkId: 'booked', type: 'dateTime', text: 'Booked', extension: [calculated('booked')] },
    { linkId: 'bmi', type: 'decimal', text: 'BMI', extension: [calculated('bmi')] },
    { linkId: 'dose', type: 'quantity', text: 'Dose', extension: [calculated('dose')] },
  ],
} as const satisfies Questionnaire;

/** The respondent's answers: the first minutes of 1 May at one end of the day's zones, the last at the other. */
export const FORMATS_VALUE = {
  resourceType: 'QuestionnaireResponse',
  status: 'in-progress',
  item: [
    { linkId: 'born', answer: [{ valueDate: '2024-05-01' }] },
    { linkId: 'seen', answer: [{ valueDateTime: '2024-05-01T00:30:00+14:00' }] },
    { linkId: 'height', answer: [{ valueDecimal: 1.75 }] },
    { linkId: 'weight', answer: [{ valueQuantity: { value: 70.5, unit: 'kg', system: UCUM, code: 'kg' } }] },
  ],
} as const satisfies QuestionnaireResponse;

const VALUES: Readonly<Record<string, Answer>> = {
  'next-day': { kind: 'date', value: '2024-05-01' },
  'next-month': { kind: 'date', value: '2024-05' },
  'next-year': { kind: 'date', value: '2024' },
  booked: { kind: 'dateTime', value: '2024-05-01T23:30:00-12:00' },
  bmi: { kind: 'decimal', value: 1234.5 },
  dose: { kind: 'quantity', value: { value: 1.5, unit: 'mg', system: UCUM, code: 'mg' } },
};

/** The test's evaluator: a fixed value per expression, since the kit has no FHIRPath (ADR-0017). */
export const FORMATS_OPTIONS = {
  evaluator: { evaluate: ({ expression }) => VALUES[expression] },
} as const satisfies SessionOptions;

/**
 * A host's session over `FORMATS_VALUE` whose completion was already refused,
 * so the first render shows an issue naming a formatted limit, in place and
 * in the error summary.
 */
export function refused(): Session {
  const session = hydrateSession(FORMATS, FORMATS_VALUE, FORMATS_OPTIONS);
  session.dispatch({ type: 'RequestCompletion' });
  return session;
}
