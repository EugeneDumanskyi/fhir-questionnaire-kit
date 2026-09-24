import type { Diagnostic, Questionnaire as QuestionnaireResource, QuestionnaireResponse, Session, SessionOptions } from '@fhirq/core';
import type { ViewOptions } from '@fhirq/core/view';
import type { ReactElement } from 'react';

import { useQuestionnaire } from './hook.js';
import { Form } from './ui/form.js';

/**
 * A questionnaire, whose session the component creates and owns, or a
 * session the host owns (ADR-0015). Never both, and never a session with a
 * `value`.
 *
 * @alpha
 */
export type QuestionnaireProps = (
  | {
      readonly questionnaire: QuestionnaireResource;
      readonly session?: never;
      /** Options for the session the component creates, read once. */
      readonly options?: SessionOptions;
      /** The response the form shows. One that is not an echo of the last emitted replaces the session (ADR-0015). */
      readonly value?: QuestionnaireResponse;
    }
  | { readonly session: Session; readonly questionnaire?: never; readonly options?: never; readonly value?: never }
) & {
  /** A BCP 47 tag. Default `"en"`, never sniffed (ADR-0020). */
  readonly locale?: string;
  /** An IANA zone for `dateTime` answers. */
  readonly timeZone?: string;
  /** Catalogue overrides, key by key. */
  readonly messages?: ViewOptions['messages'];
  /** The response, without `authored`, after each change. */
  readonly onChange?: (response: QuestionnaireResponse) => void;
  /** The response, without `authored`, once completed. */
  readonly onComplete?: (response: QuestionnaireResponse) => void;
  /** Each diagnostic the adapter raises itself. */
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
};

/**
 * The default UI (ADR-0013 tier 1), on the public hook alone: `ui/` maps the
 * view model to markup per docs/08-dom-contract.md and computes nothing
 * itself (M6 AC-2, `test/ui-imports.test.ts`).
 *
 * @alpha
 */
export function Questionnaire(props: QuestionnaireProps): ReactElement {
  // The props are the hook's options, by name; `questionnaire` and `session` are its source.
  const { view } = useQuestionnaire(props.session ?? props.questionnaire, props);
  return <Form model={view} />;
}
