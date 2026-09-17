import type { Session } from '@fhirq/core';
import {
  createView,
  type ErrorSummary,
  type ShortTextViewNode,
  type ViewNode,
  type YesNoViewNode,
} from '@fhirq/core/view';
import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';

export interface QuestionnaireProps {
  /** A host-created session (ADR-0015). The S1 slice accepts nothing else. */
  readonly session: Session;
}

/**
 * The default UI, S1 slice. Maps view nodes to markup per
 * docs/08-dom-contract.md and computes nothing itself. No DOM access during
 * render: focus and announcements happen in effects (ADR-0015).
 *
 * @alpha S1 spike surface: M6 adds `useQuestionnaire`, `questionnaire`, controlled mode and tiers.
 */
export function Questionnaire({ session }: QuestionnaireProps): ReactElement {
  const idPrefix = useId();
  const view = useMemo(() => createView(session, { idPrefix }), [session, idPrefix]);
  const model = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
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
      {model.nodes.map((node) => (
        <Item key={node.path} node={node} marker={model.requiredMarker} />
      ))}
      <div className="fhirq-status" part="status" role="status" ref={status} />
    </div>
  );
}

interface ItemProps {
  readonly node: ViewNode;
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

function ShortText({ node, marker }: { readonly node: ShortTextViewNode; readonly marker: string }): ReactElement {
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
        value={node.value}
        onChange={(event) => node.set(event.currentTarget.value)}
      />
    </>
  );
}

function YesNo({ node, marker }: { readonly node: YesNoViewNode; readonly marker: string }): ReactElement {
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
        {node.choices.map((choice, index) => (
          <label key={String(choice.value)} className="fhirq-choice" part="choice">
            <input
              className="fhirq-radio"
              part="radio"
              type="radio"
              name={node.ids.control}
              id={index === 0 ? node.ids.control : undefined}
              value={String(choice.value)}
              checked={choice.selected}
              onChange={() => node.set(choice.value)}
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
  const onClick = (event: MouseEvent<HTMLAnchorElement>, target: string) => {
    event.preventDefault();
    event.currentTarget.ownerDocument.getElementById(target)?.focus();
  };
  return (
    <section className="fhirq-summary" part="error-summary" id={summary.id} tabIndex={-1} aria-labelledby={summary.headingId}>
      <h2 className="fhirq-summary-heading" part="error-summary-heading" id={summary.headingId}>
        {summary.heading}
      </h2>
      <ul className="fhirq-summary-list" part="error-summary-list">
        {summary.entries.map((entry) => (
          <li key={`${entry.path} ${entry.message}`} className="fhirq-summary-entry" part="error-summary-entry">
            <a className="fhirq-summary-link" part="error-summary-link" href={`#${entry.target}`} onClick={(event) => onClick(event, entry.target)}>
              {entry.message}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
