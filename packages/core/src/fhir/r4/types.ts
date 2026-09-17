/**
 * FHIR R4 (4.0.1) `Questionnaire`, as the integrator holds it.
 *
 * **Authored, not generated** (M2 plan D14). This is the subset of R4 the kit
 * reads, with every other element of these types present and loosely typed so
 * a full R4 resource type-checks. Input is never trusted because of these
 * types: `parseQuestionnaire` narrows from `unknown` at runtime. R4 shapes are
 * declared under `fhir/r4/` and nowhere else in core (ADR-0016).
 */

export interface Extension {
  readonly url: string;
  readonly valueInteger?: number;
  readonly valueString?: string;
  readonly valueCodeableConcept?: CodeableConcept;
  readonly valueExpression?: Expression;
  readonly extension?: readonly Extension[];
  readonly [value: `value${string}`]: unknown;
}

/** R4's base `Element`, renamed so it cannot be mistaken for the DOM's. */
export interface FhirElement {
  readonly id?: string;
  readonly extension?: readonly Extension[];
}

export interface Coding extends FhirElement {
  readonly system?: string;
  readonly version?: string;
  readonly code?: string;
  readonly display?: string;
  readonly userSelected?: boolean;
}

export interface CodeableConcept extends FhirElement {
  readonly coding?: readonly Coding[];
  readonly text?: string;
}

export interface Quantity extends FhirElement {
  readonly value?: number;
  readonly comparator?: '<' | '<=' | '>=' | '>';
  readonly unit?: string;
  readonly system?: string;
  readonly code?: string;
}

export interface Reference extends FhirElement {
  readonly reference?: string;
  readonly type?: string;
  readonly identifier?: unknown;
  readonly display?: string;
}

export interface Expression extends FhirElement {
  readonly description?: string;
  readonly name?: string;
  readonly language: string;
  readonly expression?: string;
  readonly reference?: string;
}

export type QuestionnaireItemType =
  | 'group'
  | 'display'
  | 'question'
  | 'boolean'
  | 'decimal'
  | 'integer'
  | 'date'
  | 'dateTime'
  | 'time'
  | 'string'
  | 'text'
  | 'url'
  | 'choice'
  | 'open-choice'
  | 'attachment'
  | 'reference'
  | 'quantity';

export interface QuestionnaireItemEnableWhen extends FhirElement {
  readonly modifierExtension?: readonly Extension[];
  readonly question: string;
  readonly operator: 'exists' | '=' | '!=' | '>' | '<' | '>=' | '<=';
  readonly answerBoolean?: boolean;
  readonly answerDecimal?: number;
  readonly answerInteger?: number;
  readonly answerDate?: string;
  readonly answerDateTime?: string;
  readonly answerTime?: string;
  readonly answerString?: string;
  readonly answerCoding?: Coding;
  readonly answerQuantity?: Quantity;
  readonly answerReference?: Reference;
}

export interface QuestionnaireItemAnswerOption extends FhirElement {
  readonly modifierExtension?: readonly Extension[];
  readonly valueInteger?: number;
  readonly valueDate?: string;
  readonly valueTime?: string;
  readonly valueString?: string;
  readonly valueCoding?: Coding;
  readonly valueReference?: Reference;
  readonly initialSelected?: boolean;
}

export interface QuestionnaireItemInitial extends FhirElement {
  readonly modifierExtension?: readonly Extension[];
  readonly [value: `value${string}`]: unknown;
}

export interface QuestionnaireItem extends FhirElement {
  readonly modifierExtension?: readonly Extension[];
  readonly linkId: string;
  readonly definition?: string;
  readonly code?: readonly Coding[];
  readonly prefix?: string;
  readonly text?: string;
  readonly _text?: FhirElement;
  readonly type: QuestionnaireItemType;
  readonly enableWhen?: readonly QuestionnaireItemEnableWhen[];
  readonly enableBehavior?: 'all' | 'any';
  readonly required?: boolean;
  readonly repeats?: boolean;
  readonly readOnly?: boolean;
  readonly maxLength?: number;
  readonly answerValueSet?: string;
  readonly answerOption?: readonly QuestionnaireItemAnswerOption[];
  readonly initial?: readonly QuestionnaireItemInitial[];
  readonly item?: readonly QuestionnaireItem[];
}

/**
 * A FHIR R4 `Questionnaire` resource.
 *
 * @alpha M2 fixes the surface in `docs/07-api.md`.
 */
export interface Questionnaire extends FhirElement {
  readonly resourceType: 'Questionnaire';
  readonly meta?: unknown;
  readonly implicitRules?: string;
  readonly language?: string;
  readonly text?: unknown;
  readonly contained?: readonly unknown[];
  readonly modifierExtension?: readonly Extension[];
  readonly url?: string;
  readonly identifier?: readonly unknown[];
  readonly version?: string;
  readonly name?: string;
  readonly title?: string;
  readonly derivedFrom?: readonly string[];
  readonly status?: 'draft' | 'active' | 'retired' | 'unknown';
  readonly experimental?: boolean;
  readonly subjectType?: readonly string[];
  readonly date?: string;
  readonly publisher?: string;
  readonly contact?: readonly unknown[];
  readonly description?: string;
  readonly useContext?: readonly unknown[];
  readonly jurisdiction?: readonly CodeableConcept[];
  readonly purpose?: string;
  readonly copyright?: string;
  readonly approvalDate?: string;
  readonly lastReviewDate?: string;
  readonly effectivePeriod?: unknown;
  readonly code?: readonly Coding[];
  readonly item?: readonly QuestionnaireItem[];
}

export interface Identifier extends FhirElement {
  readonly use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  readonly type?: CodeableConcept;
  readonly system?: string;
  readonly value?: string;
  readonly period?: unknown;
  readonly assigner?: Reference;
}

/**
 * The `QuestionnaireResponse` fields the host owns (AC-05.1.2). Stored verbatim
 * and emitted as given; the kit never invents, infers or defaults any of them.
 *
 * @alpha M2 fixes the surface in `docs/07-api.md`.
 */
export interface HostIdentity {
  readonly subject?: Reference;
  readonly author?: Reference;
  readonly encounter?: Reference;
  readonly identifier?: Identifier;
}
