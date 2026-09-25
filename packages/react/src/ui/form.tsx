import type { ErrorSummary, ViewModel } from '@fhirq/core/view';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react';

import { Nodes } from './item.js';
import { FORMATTED, type Controls, type Ui } from './parts.js';

/** Finds an id in the tree `from` is in: the document, or a host's shadow root (DOM contract §1). */
const byId = (from: Node, id: string) => (from.getRootNode() as Document | ShadowRoot).getElementById(id);

/**
 * The default UI's form (ADR-0013 tier 1, docs/08-dom-contract.md §2). It maps
 * the view model to markup and computes nothing. The DOM is read only in
 * effects and handlers: focus moves and announcements are written after the
 * render that produced them (ADR-0015).
 */
export function Form({ model, controls = NONE, check }: { readonly model: ViewModel; readonly controls?: Controls | undefined; readonly check?: Ui['check'] }): ReactElement {
  const form = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const { announcement, focusTarget, requiredMarker, labels } = model;
  // The controls a host writes inline are a new object each render; the same entries keep `ui`, and so every item.
  const [kept] = useState({ controls });
  if (!same(kept.controls, controls)) kept.controls = controls;
  const stable = kept.controls;
  const ui = useMemo<Ui>(() => ({ marker: requiredMarker, labels, controls: stable, check }), [requiredMarker, labels, stable, check]);

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

const NONE: Controls = {};

const same = (a: Controls, b: Controls) => {
  const keys = Object.keys(a) as (keyof Controls)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

function Summary({ summary }: { readonly summary: ErrorSummary }): ReactElement {
  const onClick = (event: MouseEvent<HTMLAnchorElement>, focusId: string) => {
    event.preventDefault();
    byId(event.currentTarget, focusId)?.focus();
  };
  return (
    <section className="fhirq-summary" part="summary" id={summary.id} tabIndex={-1} aria-labelledby={summary.headingId}>
      <h2 className="fhirq-summary-heading" part="summary-heading" id={summary.headingId}>
        {summary.heading}
      </h2>
      <ul className="fhirq-summary-list" part="summary-list">
        {summary.entries.map((entry) => (
          <li key={`${entry.path} ${entry.message}`} className="fhirq-summary-entry" part="summary-entry" {...FORMATTED}>
            {entry.focusId === null ? (
              entry.message
            ) : (
              <a className="fhirq-summary-link" part="summary-link" href={`#${entry.focusId}`} onClick={(event) => onClick(event, entry.focusId ?? '')} {...FORMATTED}>
                {entry.message}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
