import type { ControlKind, ControlProps, ControlView, ViewNode } from '@fhirq/core/view';
import { memo, type ComponentType, type ReactElement } from 'react';

import { Entry } from './entry.js';
import { Choices, List } from './options.js';
import { Errors, FORMATTED, Label, Legend, leaving, Text, type Answerable, type Ui } from './parts.js';
import { Slot } from './slot.js';

interface ItemProps {
  readonly node: ViewNode;
  readonly ui: Ui;
  /** The heading level a repeat instance's name takes: one below the nearest heading (DOM contract §3.8). */
  readonly level: number;
}

/** Item roots in order, keyed by item path, never by position (T11). */
export function Nodes({ nodes, ui, level }: { readonly nodes: readonly ViewNode[]; readonly ui: Ui; readonly level: number }): ReactElement {
  return (
    <>
      {nodes.map((node) => (
        <Item key={node.path} node={node} ui={ui} level={level} />
      ))}
    </>
  );
}

/**
 * One item root. It re-renders only when its view node is a new object,
 * which the view makes only when the node or something under it changed
 * (ADR-0007, ADR-0015); `ui` and `level` do not change.
 */
const Item = memo(function Item({ node, ui, level }: ItemProps): ReactElement {
  if (node.control === 'group' || node.control === 'repeating-group') {
    const stem = node.control === 'group' ? 'group' : 'repeat';
    return (
      <fieldset
        className={`fhirq-item fhirq-${stem}`}
        part={`item ${stem}`}
        data-path={node.path}
        aria-describedby={node.invalid ? node.ids.error : undefined}
        onBlur={leaving(node)}
      >
        <Legend node={node} ui={ui} />
        {node.control === 'group' ? <Nodes nodes={node.children} ui={ui} level={level} /> : <Instances node={node} ui={ui} level={level} />}
        <Errors node={node} />
      </fieldset>
    );
  }
  // Read-only kinds carry no requirement and are never left (DOM contract §3.6).
  const answerable = answers(node);
  // A host's control for this kind (tier 3). The map pairs each kind with its props, which one lookup cannot show.
  const Control = answerable ? (ui.controls[node.control] as ComponentType<ControlProps<Answerable>> | undefined) : undefined;
  if (answerable && Control !== undefined) return <Slot node={node} ui={ui} Control={Control} />;
  return (
    <div className="fhirq-item" part="item" data-path={node.path} onBlur={answerable ? leaving(node) : undefined}>
      <Body node={node} ui={ui} />
      <Errors node={node} />
    </div>
  );
});

/** The kinds a respondent answers: all but the read-only ones, once groups are ruled out. */
const answers = (node: ViewNode): node is ControlView<Answerable> => node.control !== 'calculated' && node.control !== 'statement' && node.control !== 'unsupported';

/** Narrows to kinds the view's union declares together, which a `switch` cannot split. */
const among = <K extends ControlKind>(node: ViewNode, kinds: readonly K[]): node is ControlView<K> => (kinds as readonly ControlKind[]).includes(node.control);

function Body({ node, ui }: { readonly node: ViewNode; readonly ui: Ui }): ReactElement | null {
  if (among(node, ['yes-no', 'single-choice', 'multi-choice'])) return <Choices node={node} ui={ui} />;
  if (among(node, ['single-list', 'single-menu', 'multi-list'])) return <List node={node} ui={ui} />;
  if (among(node, ['short-text', 'long-text', 'integer', 'decimal', 'calendar-date', 'date-time', 'quantity'])) return <Entry node={node} ui={ui} />;
  switch (node.control) {
    case 'calculated':
      return (
        <>
          <Label node={node} ui={ui} />
          <output className="fhirq-value" part="value" id={node.ids.control} aria-labelledby={node.ids.label} {...FORMATTED}>
            {node.display}
          </output>
        </>
      );
    case 'statement':
      return node.richLabel === null ? (
        <p className="fhirq-statement" part="statement" id={node.ids.label}>
          {node.label}
        </p>
      ) : (
        <p className="fhirq-statement" part="statement" id={node.ids.label} dangerouslySetInnerHTML={{ __html: node.richLabel }} />
      );
    case 'unsupported':
      return (
        <div className="fhirq-unsupported" part="unsupported">
          <span className="fhirq-label" part="label">
            <Text node={node} />
          </span>
          <p className="fhirq-notice" part="notice">
            {node.notice}
          </p>
        </div>
      );
    default:
      return null;
  }
}

/**
 * A repeating group's instances, keyed by instance path, then its add control,
 * which stays focusable when it cannot add so its reason can be reached
 * (INV-P-04).
 */
function Instances({ node, ui, level }: ItemProps & { readonly node: ControlView<'repeating-group'> }): ReactElement {
  const Heading = `h${Math.min(level, 6)}` as 'h3';
  const blocked = !node.canAdd && node.reason !== null;
  return (
    <>
      {node.instances.map((instance) => (
        <section key={instance.path} className="fhirq-instance" part="instance" data-path={instance.path} aria-labelledby={instance.ids.label}>
          <Heading className="fhirq-instance-label" part="instance-label" id={instance.ids.label} {...FORMATTED}>
            {instance.label}
          </Heading>
          <Nodes nodes={instance.children} ui={ui} level={level + 1} />
          <button type="button" className="fhirq-remove" part="remove" id={instance.ids.control} onClick={instance.remove} {...FORMATTED}>
            {instance.removeLabel}
          </button>
        </section>
      ))}
      <button
        type="button"
        className="fhirq-add"
        part="add"
        id={node.ids.control}
        aria-disabled={node.canAdd ? undefined : true}
        aria-describedby={blocked ? node.ids.description : undefined}
        onClick={node.add}
      >
        {node.addLabel}
      </button>
      {node.reason !== null && (
        <p className="fhirq-reason" part="reason" id={node.ids.description} {...FORMATTED}>
          {node.reason}
        </p>
      )}
    </>
  );
}
