import type { Questionnaire as QuestionnaireResource, Session, SessionOptions } from '@fhirq/core';
import type { ViewOptions } from '@fhirq/core/view';
import type { ReactElement } from 'react';

import { useQuestionnaire } from './hook.js';
import { Form } from './ui/form.js';

/**
 * A questionnaire, whose session the component creates and owns, or a
 * session the host owns (ADR-0015). Never both.
 *
 * @alpha
 */
export type QuestionnaireProps = (
  | {
      readonly questionnaire: QuestionnaireResource;
      readonly session?: never;
      /** Options for the session the component creates, read once. */
      readonly options?: SessionOptions;
    }
  | { readonly session: Session; readonly questionnaire?: never; readonly options?: never }
) & {
  /** A BCP 47 tag. Default `"en"`, never sniffed (ADR-0020). */
  readonly locale?: string;
  /** An IANA zone for `dateTime` answers. */
  readonly timeZone?: string;
  /** Catalogue overrides, key by key. */
  readonly messages?: ViewOptions['messages'];
};

/**
 * The default UI (ADR-0013 tier 1), on the public hook alone: `ui/` maps the
 * view model to markup per docs/08-dom-contract.md and computes nothing
 * itself (M6 AC-2, `test/ui-imports.test.ts`).
 *
 * @alpha
 */
export function Questionnaire(props: QuestionnaireProps): ReactElement {
  const { locale, timeZone, messages, options } = props;
  const { view } = useQuestionnaire(props.session ?? props.questionnaire, {
    ...(locale === undefined ? {} : { locale }),
    ...(timeZone === undefined ? {} : { timeZone }),
    ...(messages === undefined ? {} : { messages }),
    ...(options === undefined ? {} : { options }),
  });
  return <Form model={view} />;
}
