import type { ErrorSummary, ViewModel } from '@fhirq/core/view';
import { useEffect, useMemo, useRef, type MouseEvent, type ReactElement } from 'react';

import { Nodes } from './item.js';
import type { Ui } from './parts.js';

/** Finds an id in the tree `from` is in: the document, or a host's shadow root (DOM contract §1). */
const byId = (from: Node, id: string) => (from.getRootNode() as Document | ShadowRoot).getElementById(id);

/**
 * The default UI's form (ADR-0013 tier 1, docs/08-dom-contract.md §2). It maps
 * the view model to markup and computes nothing. The DOM is read only in
 * effects and handlers: focus moves and announcements are written after the
 * render that produced them (ADR-0015).
 */
export function Form({ model }: { readonly model: ViewModel }): ReactElement {
  const form = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const { announcement, focusTarget, requiredMarker, labels } = model;
  const ui = useMemo<Ui>(() => ({ marker: requiredMarker, labels }), [requiredMarker, labels]);

  useEffect(() => {
    // Assigned even when the text repeats, so a second identical message is announced.
    if (announcement !== null && status.current !== null) status.current.textContent = announcement.text;
  }, [announcement]);

  useEffect(() => {
    if (focusTarget !== null && form.current !== null) byId(form.current, focusTarget.id)?.focus();
  }, [focusTarget]);

  return (
    <div className="fhirq-form" part="form" ref={form}>
      {model.errorSummary !== null && <Summary summary={model.errorSummary} />}
      <Nodes nodes={model.nodes} ui={ui} level={3} />
      <div className="fhirq-status" part="status" role="status" ref={status} />
    </div>
  );
}

function Summary({ summary }: { readonly summary: ErrorSummary }): ReactElement {
  const onClick = (event: MouseEvent<HTMLAnchorElement>, focusId: string) => {
    event.preventDefault();
    byId(event.currentTarget, focusId)?.focus();
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
