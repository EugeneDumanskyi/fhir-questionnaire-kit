/**
 * FHIR R4 (4.0.1) `Questionnaire`, as the integrator holds it: JSON from a
 * server or a file, or a FHIR library's own resource type.
 *
 * **Authored, not generated** (M2 plan D14). The resource's own elements are
 * typed, so a full R4 resource type-checks and a misspelt top-level element in
 * a literal does not. Nested elements are `unknown`: `parseQuestionnaire`
 * narrows the whole resource from `unknown` at runtime (INV-D-01), and a
 * nested type here would name a check the type system does not make while
 * adding a dozen R4 shapes to the public surface (NFR-U-05). R4 shapes are
 * declared under `fhir/r4/` and nowhere else in core (ADR-0016).
 *
 * @beta
 */
export interface Questionnaire {
  readonly resourceType: 'Questionnaire';
  readonly id?: string;
  readonly meta?: unknown;
  readonly implicitRules?: string;
  readonly language?: string;
  readonly text?: unknown;
  readonly contained?: readonly unknown[];
  readonly extension?: readonly unknown[];
  readonly modifierExtension?: readonly unknown[];
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
  readonly jurisdiction?: readonly unknown[];
  readonly purpose?: string;
  readonly copyright?: string;
  readonly approvalDate?: string;
  readonly lastReviewDate?: string;
  readonly effectivePeriod?: unknown;
  readonly code?: readonly unknown[];
  /** The items, each a `Questionnaire.item` as R4 JSON. */
  readonly item?: readonly unknown[];
}

/**
 * The `QuestionnaireResponse` fields the host owns (AC-05.1.2): `subject`,
 * `author` and `encounter` as R4 `Reference`s and `identifier` as an R4
 * `Identifier`. Stored verbatim and emitted as given (M3); the kit never
 * invents, infers or defaults any of them.
 *
 * @beta
 */
export interface HostIdentity {
  readonly subject?: object;
  readonly author?: object;
  readonly encounter?: object;
  readonly identifier?: object;
}
