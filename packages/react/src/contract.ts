import type { Diagnostic } from '@fhirq/core';
import type { ViewNode } from '@fhirq/core/view';

/** Set by a bundler or by Node; absent in a browser that loads the module as it is. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

type Check = (node: ViewNode, root: HTMLElement) => void;

/**
 * The tier-3 obligations a mounted control is checked for (ADR-0013): an
 * element with `ids.control` in the item's tree (a portal counts: the label
 * and summary link still reach it), `aria-invalid` from `node.invalid`
 * as a string, and `aria-describedby` naming `ids.error` while invalid. Each
 * missing one is raised once per item as `control-contract`, with the kind
 * as `detail` and the attribute as `expected`.
 */
function checker(raise: (diagnostic: Diagnostic) => void): Check {
  const raised = new Set<string>();
  return (node, root) => {
    const { ids } = node;
    const control = (root.getRootNode() as Document | ShadowRoot).getElementById(ids.control);
    const missing =
      control === null
        ? ['id']
        : [
            ...(control.getAttribute('aria-invalid') === String(node.invalid) ? [] : ['aria-invalid']),
            ...(!node.invalid || (control.getAttribute('aria-describedby') ?? '').split(' ').includes(ids.error) ? [] : ['aria-describedby']),
          ];
    for (const expected of missing) {
      if (raised.has(`${node.path} ${expected}`)) continue;
      raised.add(`${node.path} ${expected}`);
      raise({ code: 'control-contract', severity: 'warning', path: node.path, detail: node.control, expected, related: [] });
    }
  };
}

/**
 * The check's factory in a development build, `undefined` in production.
 * Written out whole, so a bundler's define folds it and a production build
 * drops the check; without a bundler or Node there is no `process`, and no
 * check.
 */
export const contractCheck: ((raise: (diagnostic: Diagnostic) => void) => Check) | undefined = (() => {
  try {
    return process.env.NODE_ENV !== 'production' ? checker : undefined;
  } catch {
    return undefined;
  }
})();
