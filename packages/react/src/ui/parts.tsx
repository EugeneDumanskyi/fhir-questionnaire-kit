import type { ControlKind, ControlProps, ViewModel, ViewNode } from '@fhirq/core/view';
import type { ComponentType, FocusEvent, ReactElement, ReactNode } from 'react';

/** The kinds a host may replace (ADR-0013 amendment note): the 13 a respondent answers. */
export type Answerable = Exclude<ControlKind, 'calculated' | 'statement' | 'unsupported' | 'group' | 'repeating-group'>;

/** Tier-3 controls by kind (ADR-0013). */
export type Controls = { readonly [K in Answerable]?: ComponentType<ControlProps<K>> };

/**
 * What every item shares: the model's fixed text, the host's controls and a
 * development build's tier-3 check. One object while none of them changes,
 * so memoised items skip on it.
 */
export interface Ui {
  readonly marker: string;
  readonly labels: ViewModel['labels'];
  readonly controls: Controls;
  /** Run after each render of a host's control: `undefined` in production. */
  readonly check: ((node: ViewNode, root: HTMLElement) => void) | undefined;
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

/**
 * Spread on every element whose text holds a value the view formatted with
 * `Intl`: a calculated value, an issue, a summary entry, an instance's name
 * and the reason the add control is inert. A server's ICU data can word them
 * differently from the browser's ("May 1, 2024, 11:30 PM" in Node, "… at
 * 11:30 PM" in Safari). Hydration then neither warns nor discards the server
 * markup: React 19 keeps the server's wording until the node next changes,
 * React 18 puts in the browser's (ADR-0020 amendment note).
 */
export const FORMATTED = { suppressHydrationWarning: true } as const;

/** The error container, every item root's last child (DOM contract §3). */
export function Errors({ node }: { readonly node: ViewNode }): ReactElement {
  return (
    <div className="fhirq-error" part="error" id={node.ids.error} hidden={!node.invalid}>
      {node.issues.map((issue) => (
        <p key={issue.rule} className="fhirq-error-message" part="error-message" {...FORMATTED}>
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
