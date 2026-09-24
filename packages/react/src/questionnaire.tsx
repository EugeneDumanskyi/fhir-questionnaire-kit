import type { Questionnaire as QuestionnaireResource, Session, SessionOptions } from '@fhirq/core';
import type { ControlView, ErrorSummary, ViewNode, ViewOptions } from '@fhirq/core/view';
import { memo, useEffect, useRef, type FocusEvent, type MouseEvent, type ReactElement } from 'react';

import { useQuestionnaire } from './hook.js';

/** The two control kinds the S1 slice renders; the rest are M6 step 5 (M5 plan D14). */
type SliceNode = ControlView<'yes-no'> | ControlView<'short-text'>;
const inSlice = (node: ViewNode): node is SliceNode => node.control === 'yes-no' || node.control === 'short-text';

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
 * The default UI (ADR-0013 tier 1), on the public hook alone. Maps view nodes
 * to markup per docs/08-dom-contract.md and computes nothing itself. No DOM
 * access during render: focus and announcements happen in effects
 * (ADR-0015).
 *
 * @alpha
 */
export function Questionnaire(props: QuestionnaireProps): ReactElement {
  const { locale, timeZone, messages, options } = props;
  const { view: model } = useQuestionnaire(props.session ?? props.questionnaire, {
    ...(locale === undefined ? {} : { locale }),
    ...(timeZone === undefined ? {} : { timeZone }),
    ...(messages === undefined ? {} : { messages }),
    ...(options === undefined ? {} : { options }),
  });
  const form = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Assigned even when the text repeats, so a second identical message is announced.
    if (model.announcement !== null && status.current !== null) status.current.textContent = model.announcement.text;
  }, [model.announcement]);

  useEffect(() => {
    if (model.focusTarget !== null) form.current?.ownerDocument.getElementById(model.focusTarget.id)?.focus();
  }, [model.focusTarget]);

  return (
    <div className="fhirq-form" part="form" ref={form}>
      {model.errorSummary !== null && <Summary summary={model.errorSummary} />}
      {model.nodes.filter(inSlice).map((node) => (
        <Item key={node.path} node={node} marker={model.requiredMarker} />
      ))}
      <div className="fhirq-status" part="status" role="status" ref={status} />
    </div>
  );
}

interface ItemProps {
  readonly node: SliceNode;
  readonly marker: string;
}

/** Re-renders only when this path's view node is a new object (ADR-0007, ADR-0015). */
const Item = memo(function Item({ node, marker }: ItemProps): ReactElement {
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    // Leaving the item, not moving between its own radios, is `NoteItemLeft`.
    if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) node.leave();
  };
  return (
    <div className="fhirq-item" part="item" data-path={node.path} onBlur={onBlur}>
      {node.control === 'yes-no' ? <YesNo node={node} marker={marker} /> : <ShortText node={node} marker={marker} />}
      <div className="fhirq-error" part="error" id={node.ids.error} hidden={!node.invalid}>
        {node.issues.map((issue) => (
          <p key={issue.rule} className="fhirq-error-message" part="error-message">
            {issue.message}
          </p>
        ))}
      </div>
    </div>
  );
});

function Marker({ node, marker }: ItemProps): ReactElement | null {
  return node.required ? (
    <span className="fhirq-required" part="required" aria-hidden="true">
      {marker}
    </span>
  ) : null;
}

function ShortText({ node, marker }: { readonly node: ControlView<'short-text'>; readonly marker: string }): ReactElement {
  return (
    <>
      <label className="fhirq-label" part="label" id={node.ids.label} htmlFor={node.ids.control}>
        {node.label}
        <Marker node={node} marker={marker} />
      </label>
      <input
        className="fhirq-control"
        part="control"
        id={node.ids.control}
        type="text"
        aria-required={node.required}
        aria-invalid={node.invalid}
        aria-describedby={node.invalid ? node.ids.error : undefined}
        value={node.entry}
        onChange={(event) => node.set(event.currentTarget.value)}
      />
    </>
  );
}

function YesNo({ node, marker }: { readonly node: ControlView<'yes-no'>; readonly marker: string }): ReactElement {
  return (
    <>
      <span className="fhirq-label" part="label" id={node.ids.label}>
        {node.label}
        <Marker node={node} marker={marker} />
      </span>
      <div
        className="fhirq-choices"
        part="choices"
        role="radiogroup"
        aria-labelledby={node.ids.label}
        aria-required={node.required}
        aria-invalid={node.invalid}
        aria-describedby={node.invalid ? node.ids.error : undefined}
      >
        {node.options.map((choice, index) => (
          <label key={choice.key} className="fhirq-choice" part="choice">
            <input
              className="fhirq-radio"
              part="radio"
              type="radio"
              name={node.ids.control}
              id={index === 0 ? node.ids.control : undefined}
              value={choice.key}
              checked={choice.selected}
              onChange={() => node.set(choice.key)}
            />
            <span className="fhirq-choice-label" part="choice-label">
              {choice.label}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function Summary({ summary }: { readonly summary: ErrorSummary }): ReactElement {
  const onClick = (event: MouseEvent<HTMLAnchorElement>, focusId: string) => {
    event.preventDefault();
    event.currentTarget.ownerDocument.getElementById(focusId)?.focus();
  };
  return (
    <section className="fhirq-summary" part="error-summary" id={summary.id} tabIndex={-1} aria-labelledby={summary.headingId}>
      <h2 className="fhirq-summary-heading" part="error-summary-heading" id={summary.headingId}>
        {summary.heading}
      </h2>
      <ul className="fhirq-summary-list" part="error-summary-list">
        {summary.entries.map((entry) => (
          <li key={`${entry.path} ${entry.message}`} className="fhirq-summary-entry" part="error-summary-entry">
            {entry.focusId === null ? (
              entry.message
            ) : (
              <a className="fhirq-summary-link" part="error-summary-link" href={`#${entry.focusId}`} onClick={(event) => onClick(event, entry.focusId ?? '')}>
                {entry.message}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
