import type { ControlProps, ControlView } from '@fhirq/core/view';
import { useEffect, useRef, type ComponentType, type ReactElement } from 'react';

import { Errors, Label, type Answerable, type Ui } from './parts.js';

/**
 * A host's control in the kit's chrome (ADR-0013 tier 3, DOM contract §3.9):
 * the item root, the label with its required marker, and the error container
 * around it, with the same ids as the default. The host's control applies
 * `ids.control`, `aria-invalid` and `aria-describedby` and calls `leave()`
 * itself; a development build checks the first three after each render.
 */
export function Slot<K extends Answerable>({ node, ui, Control }: { readonly node: ControlView<K>; readonly ui: Ui; readonly Control: ComponentType<ControlProps<K>> }): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  // Every answerable kind binds `set`; the view's union cannot say so for a generic kind.
  const { set } = node as unknown as Pick<ControlProps<K>, 'set'>;
  const { check } = ui;
  useEffect(() => {
    if (root.current !== null) check?.(node, root.current);
  }, [check, node]);
  return (
    <div className="fhirq-item" part="item" data-path={node.path} ref={root}>
      <Label node={node} ui={ui} labels />
      <Control node={node} ids={node.ids} set={set} clear={node.clear} leave={node.leave} />
      <Errors node={node} />
    </div>
  );
}
