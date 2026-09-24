import type { ControlView } from '@fhirq/core/view';
import { useEffect, useRef, type ReactElement } from 'react';

import { Label, state, type Props } from './parts.js';

type ListKind = 'single-list' | 'single-menu' | 'multi-list';
type ChoiceKind = 'yes-no' | 'single-choice' | 'multi-choice';

/**
 * `yes-no` and the five option kinds (DOM contract §3.2, §3.5). A value set's
 * status and retry come before the options, an open choice's free text after
 * them. A value is always an option's `key`, handed back as read.
 */
function Options({ node, ui, list, children }: Props<ControlView<ChoiceKind | ListKind>> & { readonly list: boolean; readonly children: ReactElement }): ReactElement {
  return (
    <>
      <Label node={node} ui={ui} labels={list} />
      {node.control !== 'yes-no' && node.optionMessage !== null && (
        <p className="fhirq-options-status" part="options-status">
          {node.optionMessage}
        </p>
      )}
      {node.control !== 'yes-no' && node.optionState === 'failed' && (
        <button type="button" className="fhirq-retry" part="retry" onClick={node.retry}>
          {ui.labels.retry}
        </button>
      )}
      {children}
      {node.control !== 'yes-no' && node.other !== null && (
        <label className="fhirq-other" part="other">
          {ui.labels.other}
          <input className="fhirq-other-text" part="other-text" type="text" value={node.other} onChange={(event) => node.setOther(event.currentTarget.value)} />
        </label>
      )}
    </>
  );
}

/** All shown: native same-name radios, or checkboxes. `ids.control` is on the first, the one a summary link reaches. */
export function Choices({ node, ui }: Props<ControlView<ChoiceKind>>): ReactElement {
  const many = node.control === 'multi-choice';
  const kind = many ? 'checkbox' : 'radio';
  return (
    <Options node={node} ui={ui} list={false}>
      <div className="fhirq-choices" part="choices" role={many ? 'group' : 'radiogroup'} aria-labelledby={node.ids.label} {...state(node)}>
        {node.options.map((choice, index) => (
          <label key={choice.key} className="fhirq-choice" part="choice">
            <input
              className={`fhirq-${kind}`}
              part={kind}
              type={kind}
              name={many ? undefined : node.ids.control}
              id={index === 0 ? node.ids.control : undefined}
              value={choice.key}
              checked={choice.selected}
              onChange={() => (node.control === 'multi-choice' ? node.toggle(choice.key) : node.set(choice.key))}
            />
            <span className="fhirq-choice-label" part="choice-label">
              {choice.label}
            </span>
          </label>
        ))}
      </div>
    </Options>
  );
}

/**
 * A list or a menu. React selects a single select's first option when its
 * value matches none, which would show an answer there is not; so a list
 * with nothing selected is left uncontrolled, and cleared in an effect
 * after it had a selection.
 */
export function List({ node, ui }: Props<ControlView<ListKind>>): ReactElement {
  const select = useRef<HTMLSelectElement>(null);
  const keys = node.options.filter((option) => option.selected).map((option) => option.key);
  const [first] = keys;
  useEffect(() => {
    if (node.control === 'single-list' && first === undefined && select.current !== null) select.current.selectedIndex = -1;
  }, [node.control, first]);
  const menu = node.control === 'single-menu';
  return (
    <Options node={node} ui={ui} list>
      <select
        ref={select}
        className="fhirq-control"
        part="control"
        id={node.ids.control}
        {...state(node)}
        multiple={node.control === 'multi-list'}
        size={menu ? undefined : Math.min(node.options.length, 8)}
        value={node.control === 'multi-list' ? keys : menu ? (first ?? '') : first}
        onChange={(event) => {
          const { value, selectedOptions } = event.currentTarget;
          if (node.control === 'multi-list') node.set(Array.from(selectedOptions, (option) => option.value));
          else if (value === '') node.clear();
          else node.set(value);
        }}
      >
        {menu && <option value="">{ui.labels.choose}</option>}
        {node.options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </Options>
  );
}
