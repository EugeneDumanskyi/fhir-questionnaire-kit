import type { ViewModel, ViewNode } from '@fhirq/core/view';
import type { FocusEvent, ReactElement, ReactNode } from 'react';

/** What every item shares from the model: fixed text, one object for the view's life, so memoised items skip on it. */
export interface Ui {
  readonly marker: string;
  readonly labels: ViewModel['labels'];
}

export interface Props<N extends ViewNode = ViewNode> {
  readonly node: N;
  readonly ui: Ui;
}

/** The label's content: plain text, or the host sanitizer's markup as given (INV-X-06), in a span so the required marker can follow it. */
export function Text({ node }: { readonly node: ViewNode }): ReactNode {
  return node.richLabel === null ? node.label : <span dangerouslySetInnerHTML={{ __html: node.richLabel }} />;
}

function Marker({ node, ui }: Props): ReactElement | null {
  return node.required ? (
    <span className="fhirq-required" part="required" aria-hidden="true">
      {ui.marker}
    </span>
  ) : null;
}

/** A `label` for the control when there is one element to name, a `span` the group or value is labelled by otherwise. */
export function Label({ node, ui, labels }: Props & { readonly labels?: boolean }): ReactElement {
  const content = (
    <>
      <Text node={node} />
      <Marker node={node} ui={ui} />
    </>
  );
  return labels === true ? (
    <label className="fhirq-label" part="label" id={node.ids.label} htmlFor={node.ids.control}>
      {content}
    </label>
  ) : (
    <span className="fhirq-label" part="label" id={node.ids.label}>
      {content}
    </span>
  );
}

/** A group's name: a legend a summary link may move focus to. */
export function Legend({ node, ui }: Props): ReactElement {
  return (
    <legend className="fhirq-label" part="label" id={node.ids.label} tabIndex={-1}>
      <Text node={node} />
      <Marker node={node} ui={ui} />
    </legend>
  );
}

/** The error container, every item root's last child (DOM contract §3). */
export function Errors({ node }: { readonly node: ViewNode }): ReactElement {
  return (
    <div className="fhirq-error" part="error" id={node.ids.error} hidden={!node.invalid}>
      {node.issues.map((issue) => (
        <p key={issue.rule} className="fhirq-error-message" part="error-message">
          {issue.message}
        </p>
      ))}
    </div>
  );
}

/** The ARIA state an answerable control carries, always as strings (DOM contract §1). */
export const state = (node: ViewNode) => ({
  'aria-required': node.required,
  'aria-invalid': node.invalid,
  'aria-describedby': node.invalid ? node.ids.error : undefined,
});

/**
 * The leave rule (DOM contract §1): focus leaving the item root, not moving
 * between its own parts, is `leave()`. A `null` related target is outside.
 */
export const leaving =
  (node: ViewNode) =>
  (event: FocusEvent<HTMLElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) node.leave();
  };
