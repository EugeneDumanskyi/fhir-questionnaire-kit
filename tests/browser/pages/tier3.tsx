import type { ControlKind, ControlProps } from '@fhirq/core/view';
import type { ReactElement } from 'react';

/**
 * Tier 3 in React (ADR-0013): an accessible override of every one of the 13
 * answerable kinds, for M8's axe matrix. Entry kinds are a text field, with
 * a unit menu for a quantity that names its units; option kinds are a native
 * `select`. Each meets the contract's duties (`08-dom-contract.md` §3.9):
 * `ids.control` on the field, `aria-invalid`, `aria-describedby` naming the
 * error while invalid, and `leave()` on blur. The headless page draws its
 * questions with them too.
 */

export type EntryKind = 'short-text' | 'long-text' | 'integer' | 'decimal' | 'calendar-date' | 'date-time' | 'quantity';
export type OptionKind = 'yes-no' | 'single-choice' | 'single-list' | 'single-menu' | 'multi-choice' | 'multi-list';

/** What these controls read: the node answers through its own `set`, the one `ControlProps` passes. */
export type Props<K extends ControlKind> = Pick<ControlProps<K>, 'node' | 'ids' | 'leave'>;

const duties = ({ node, ids, leave }: Props<EntryKind | OptionKind>) => ({
  id: ids.control,
  'aria-invalid': node.invalid,
  'aria-describedby': node.invalid ? ids.error : undefined,
  onBlur: leave,
});

export function Entry(props: Props<EntryKind>): ReactElement {
  const { node, ids } = props;
  if (node.control === 'long-text') return <textarea {...duties(props)} value={node.entry} onChange={(event) => node.set(event.currentTarget.value)} />;
  const field = <input {...duties(props)} value={node.entry} onChange={(event) => node.set(event.currentTarget.value)} />;
  if (node.control !== 'quantity' || node.units.length === 0) return field;
  return (
    <>
      {field}
      <select aria-labelledby={ids.label} value={node.units.find((unit) => unit.selected)?.key ?? ''} onChange={(event) => node.setUnit(event.currentTarget.value)}>
        {node.units.map((unit) => (
          <option key={unit.key} value={unit.key}>
            {unit.label}
          </option>
        ))}
      </select>
    </>
  );
}

export function Options(props: Props<OptionKind>): ReactElement {
  const { node } = props;
  const selected = node.options.filter((option) => option.selected).map((option) => option.key);
  const multiple = node.control === 'multi-choice' || node.control === 'multi-list';
  return (
    <select
      {...duties(props)}
      multiple={multiple}
      value={multiple ? selected : (selected[0] ?? '')}
      onChange={(event) => {
        const keys = [...event.currentTarget.selectedOptions].map((option) => option.value).filter((key) => key !== '');
        if (node.control === 'multi-choice' || node.control === 'multi-list') node.set(keys);
        else if (keys[0] === undefined) node.clear();
        // `yes-no` and the single kinds, whose `set` takes one key.
        else (node.set as (key: string) => void)(keys[0]);
      }}
    >
      {multiple ? null : <option value="">Choose</option>}
      {node.options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** The override of every answerable kind, as `<Questionnaire controls>` takes it. */
export const CONTROLS = {
  'yes-no': Options,
  'short-text': Entry,
  'long-text': Entry,
  integer: Entry,
  decimal: Entry,
  'calendar-date': Entry,
  'date-time': Entry,
  quantity: Entry,
  'single-choice': Options,
  'single-list': Options,
  'single-menu': Options,
  'multi-choice': Options,
  'multi-list': Options,
} as const;
