import type { Session } from '@fhirq/core';
import type { ViewModel, ViewNode } from '@fhirq/core/view';
import type { ReactElement } from 'react';

import { Entry, Options, type EntryKind, type OptionKind } from './tier3.js';

/**
 * Tier 4 in React (ADR-0013): a small host that draws the view model from
 * `useQuestionnaire` with markup of its own, for M8's axe matrix. It uses the
 * view's ids, labels, issues, error summary and announcement, and none of the
 * kit's classes or stylesheets; `headless.css` is its own. The element has no
 * headless tier.
 */

const ENTRY: readonly string[] = ['short-text', 'long-text', 'integer', 'decimal', 'calendar-date', 'date-time', 'quantity'] satisfies EntryKind[];
const isEntry = (node: ViewNode): node is ViewNode & { readonly control: EntryKind } => ENTRY.includes(node.control);
const isOption = (node: ViewNode): node is ViewNode & { readonly control: OptionKind } =>
  node.control === 'yes-no' || node.control.startsWith('single-') || node.control.startsWith('multi-');

function Item({ node, view }: { readonly node: ViewNode; readonly view: ViewModel }): ReactElement {
  const children = (nodes: readonly ViewNode[]) => nodes.map((child) => <Item key={child.path} node={child} view={view} />);
  if (node.control === 'statement') return <p>{node.label}</p>;
  if (node.control === 'unsupported') return <p>{`${node.label}: ${node.notice}`}</p>;
  if (node.control === 'calculated') return <p>{`${node.label}: ${node.display}`}</p>;
  if (node.control === 'group')
    return (
      <fieldset>
        <legend>{node.label}</legend>
        {children(node.children)}
      </fieldset>
    );
  if (node.control === 'repeating-group')
    return (
      <fieldset>
        <legend>{node.label}</legend>
        {node.instances.map((instance) => (
          <fieldset key={instance.path}>
            <legend id={instance.ids.label}>{instance.label}</legend>
            {children(instance.children)}
            <button type="button" id={instance.ids.control} onClick={instance.remove}>
              {instance.removeLabel}
            </button>
          </fieldset>
        ))}
        <button type="button" id={node.ids.control} aria-disabled={!node.canAdd} aria-describedby={node.reason === null ? undefined : `${node.ids.control}-reason`} onClick={node.add}>
          {node.addLabel}
        </button>
        {node.reason === null ? null : <p id={`${node.ids.control}-reason`}>{node.reason}</p>}
      </fieldset>
    );
  return (
    <div>
      <label id={node.ids.label} htmlFor={node.ids.control}>
        {node.required ? `${node.label} ${view.requiredMarker}` : node.label}
      </label>
      {isEntry(node) ? <Entry node={node} ids={node.ids} leave={node.leave} /> : null}
      {isOption(node) ? <Options node={node} ids={node.ids} leave={node.leave} /> : null}
      {'optionState' in node ? (
        <>
          {node.optionMessage === null ? null : <p>{node.optionMessage}</p>}
          {node.optionState === 'failed' ? (
            <button type="button" onClick={node.retry}>
              {view.labels.retry}
            </button>
          ) : null}
          {node.other === null ? null : (
            <label>
              {view.labels.other}
              <input value={node.other} onChange={(event) => node.setOther(event.currentTarget.value)} onBlur={node.leave} />
            </label>
          )}
        </>
      ) : null}
      <p id={node.ids.error} hidden={!node.invalid}>
        {node.issues.map((issue) => issue.message).join(' ')}
      </p>
    </div>
  );
}

export function Headless({ session, view }: { readonly session: Session; readonly view: ViewModel }): ReactElement {
  const summary = view.errorSummary;
  return (
    <form
      className="headless"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        session.dispatch({ type: 'RequestCompletion' });
      }}
    >
      {summary === null ? null : (
        <section aria-labelledby={summary.headingId}>
          <h2 id={summary.headingId}>{summary.heading}</h2>
          <ul>
            {summary.entries.map((entry) => (
              <li key={`${entry.path ?? ''} ${entry.message}`}>{entry.focusId === null ? entry.message : <a href={`#${entry.focusId}`}>{entry.message}</a>}</li>
            ))}
          </ul>
        </section>
      )}
      {view.nodes.map((node) => (
        <Item key={node.path} node={node} view={view} />
      ))}
      <div role="status">{view.announcement?.text}</div>
    </form>
  );
}
