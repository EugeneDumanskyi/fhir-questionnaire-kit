import './tier4.css';

import type { Session } from '@fhirq/core';
import type { ViewModel, ViewNode } from '@fhirq/core/view';
import { useQuestionnaire } from '@fhirq/react';
import type { JSX } from 'react';

import { messages } from '../host.js';

/**
 * Tier 4: headless. The host draws the view model from `useQuestionnaire`
 * with markup of its own, and none of the kit's. The view still gives it the
 * ids, labels, issues, error summary and announcement, and each node's
 * commands; the session is the same one.
 */
export function Tier4({ session }: { readonly session: Session }): JSX.Element {
  const { view } = useQuestionnaire(session, { messages });
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
      {summary !== null && (
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

function Item({ node, view }: { readonly node: ViewNode; readonly view: ViewModel }): JSX.Element {
  const children = (nodes: readonly ViewNode[]) => nodes.map((child) => <Item key={child.path} node={child} view={view} />);
  switch (node.control) {
    case 'statement':
      return <p>{node.label}</p>;
    case 'unsupported':
      return <p>{`${node.label}: ${node.notice}`}</p>;
    case 'calculated':
      return <p>{`${node.label}: ${node.display}`}</p>;
    case 'group':
      return (
        <fieldset>
          <legend>{node.label}</legend>
          {children(node.children)}
        </fieldset>
      );
    case 'repeating-group':
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
          <button type="button" id={node.ids.control} aria-disabled={!node.canAdd} onClick={node.add}>
            {node.addLabel}
          </button>
          {node.reason !== null && <p>{node.reason}</p>}
        </fieldset>
      );
    default:
      return (
        <div>
          <label id={node.ids.label} htmlFor={node.ids.control}>
            {node.required ? `${node.label} ${view.requiredMarker}` : node.label}
          </label>
          <Control node={node} view={view} />
          <p id={node.ids.error} hidden={!node.invalid}>
            {node.issues.map((issue) => issue.message).join(' ')}
          </p>
        </div>
      );
  }
}

/** One native control per question: a text field for what is typed, a menu for options. */
function Control({ node, view }: { readonly node: ViewNode; readonly view: ViewModel }): JSX.Element | null {
  const duties: Duties = {
    id: node.ids.control,
    'aria-invalid': node.invalid,
    'aria-describedby': node.invalid ? node.ids.error : undefined,
    onBlur: node.leave,
  };
  if ('entry' in node) return <Typed node={node} duties={duties} unit={view.labels.unit} />;
  if (node.control === 'yes-no') return <Menu node={node} duties={duties} choose={view.labels.choose} />;
  switch (node.control) {
    case 'single-choice':
    case 'single-list':
    case 'single-menu':
      return (
        <>
          <Menu node={node} duties={duties} choose={view.labels.choose} />
          <Extras node={node} view={view} />
        </>
      );
    case 'multi-choice':
    case 'multi-list':
      return (
        <>
          <Many node={node} duties={duties} />
          <Extras node={node} view={view} />
        </>
      );
    default:
      return null;
  }
}

type Entry = Extract<ViewNode, { readonly entry: string }>;

function Typed({ node, duties, unit }: { readonly node: Entry; readonly duties: Duties; readonly unit: string }): JSX.Element {
  if (node.control === 'long-text') return <textarea {...duties} value={node.entry} onChange={(event) => node.set(event.currentTarget.value)} />;
  const field = <input {...duties} value={node.entry} onChange={(event) => node.set(event.currentTarget.value)} />;
  if (node.control !== 'quantity' || node.units.length === 0) return field;
  return (
    <>
      {field}
      <select aria-label={unit} value={node.units.find((choice) => choice.selected)?.key ?? ''} onChange={(event) => node.setUnit(event.currentTarget.value)}>
        {node.units.map((choice) => (
          <option key={choice.key} value={choice.key}>
            {choice.label}
          </option>
        ))}
      </select>
    </>
  );
}

function Many({ node, duties }: { readonly node: ViewNode & { readonly control: 'multi-choice' | 'multi-list' }; readonly duties: Duties }): JSX.Element {
  return (
    <select
      {...duties}
      multiple
      value={node.options.filter((option) => option.selected).map((option) => option.key)}
      onChange={(event) => node.set([...event.currentTarget.selectedOptions].map((option) => option.value))}
    >
      {node.options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** What every control carries: the view's id, its validity and the leave rule. */
interface Duties {
  readonly id: string;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
  readonly onBlur: () => void;
}

type OneOf = ViewNode & { readonly control: 'yes-no' | 'single-choice' | 'single-list' | 'single-menu' };

function Menu({ node, duties, choose }: { readonly node: OneOf; readonly duties: Duties; readonly choose: string }): JSX.Element {
  return (
    <select {...duties} value={node.options.find((option) => option.selected)?.key ?? ''} onChange={(event) => (event.currentTarget.value === '' ? node.clear() : node.set(event.currentTarget.value))}>
      <option value="">{choose}</option>
      {node.options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type Coded = ViewNode & { readonly control: 'single-choice' | 'single-list' | 'single-menu' | 'multi-choice' | 'multi-list' };

/** A value set that is loading or failed, with its retry, and an open choice's free text. */
function Extras({ node, view }: { readonly node: Coded; readonly view: ViewModel }): JSX.Element {
  return (
    <>
      {node.optionMessage !== null && <p>{node.optionMessage}</p>}
      {node.optionState === 'failed' && (
        <button type="button" onClick={node.retry}>
          {view.labels.retry}
        </button>
      )}
      {node.other !== null && (
        <label>
          {view.labels.other} <input value={node.other} onChange={(event) => node.setOther(event.currentTarget.value)} onBlur={node.leave} />
        </label>
      )}
    </>
  );
}
