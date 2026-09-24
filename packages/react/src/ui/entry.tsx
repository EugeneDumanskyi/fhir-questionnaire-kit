import type { ControlView } from '@fhirq/core/view';
import type { ReactElement } from 'react';

import { Label, state, type Props } from './parts.js';

export type EntryKind = 'short-text' | 'long-text' | 'integer' | 'decimal' | 'calendar-date' | 'date-time' | 'quantity';

/** Numbers get a numeric keyboard, never `type="number"`, which drops text that is not a number yet (DOM contract §3.3). */
const MODE: Partial<Record<EntryKind, 'numeric' | 'decimal'>> = { integer: 'numeric', decimal: 'decimal', quantity: 'decimal' };

function Field({
  node,
  id,
  text,
  set,
  named,
}: {
  readonly node: ControlView<EntryKind>;
  readonly id: string | undefined;
  readonly text: string;
  readonly set: (text: string) => void;
  readonly named: boolean;
}): ReactElement {
  const shared = {
    className: 'fhirq-control',
    part: 'control',
    id,
    'aria-labelledby': named ? node.ids.label : undefined,
    ...state(node),
    value: text,
  };
  return node.control === 'long-text' ? (
    <textarea {...shared} onChange={(event) => set(event.currentTarget.value)} />
  ) : (
    <input {...shared} type="text" inputMode={MODE[node.control]} onChange={(event) => set(event.currentTarget.value)} />
  );
}

/**
 * The entry kinds (DOM contract §3.1, §3.3, §3.4). The control shows `entry`,
 * the text as typed, and hands every input to `set` whole; the view keeps
 * text that is not a value yet and says so (INV-P-06).
 */
export function Entry({ node, ui }: Props<ControlView<EntryKind>>): ReactElement {
  const { entries, ids } = node;
  return (
    <>
      <Label node={node} ui={ui} labels />
      {entries === null ? (
        <Field node={node} id={ids.control} text={node.entry} set={node.set} named={false} />
      ) : (
        <div className="fhirq-entries" part="entries">
          {entries.map((text, index) => (
            // Keyed by place: these are one node's answers, not nodes, and have no path.
            <Field key={index} node={node} id={index === 0 ? ids.control : undefined} text={text} set={(typed) => node.setAt(index, typed)} named />
          ))}
        </div>
      )}
      {node.control === 'quantity' && <Unit node={node} ui={ui} />}
    </>
  );
}

/** A quantity's unit: a list of the permitted units, or typed when the questionnaire names none (§3.4). */
function Unit({ node, ui }: Props<ControlView<'quantity'>>): ReactElement {
  const selected = node.units.find((unit) => unit.selected)?.key;
  return node.units.length > 0 ? (
    <select className="fhirq-unit" part="unit" aria-label={ui.labels.unit} value={selected ?? ''} onChange={(event) => node.setUnit(event.currentTarget.value)}>
      {selected === undefined && <option value="" />}
      {node.units.map((unit) => (
        <option key={unit.key} value={unit.key}>
          {unit.label}
        </option>
      ))}
    </select>
  ) : (
    <input className="fhirq-unit" part="unit" type="text" aria-label={ui.labels.unit} value={node.unit} onChange={(event) => node.setUnit(event.currentTarget.value)} />
  );
}
