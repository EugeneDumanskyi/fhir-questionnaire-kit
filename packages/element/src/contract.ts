import type { Diagnostic } from '@fhirq/core';
import type { ViewNode } from '@fhirq/core/view';

/** Set by a bundler or by Node; absent in a browser that loads the module as it is. */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Checks a host's control once its item has rendered: the node it was given, and its item root. */
export type Check = (node: ViewNode, item: Element) => void;

/**
 * The tier-3 obligations a host's control is checked for (ADR-0013, DOM
 * contract §3.9): an element with `ids.control` in the shadow root,
 * `aria-invalid` from `node.invalid` as a string, and `aria-describedby`
 * naming `ids.error` while invalid. Each missing one is raised once per item
 * as `control-contract`, with the kind as `detail` and the attribute as
 * `expected`, and written to the console as its code and kind only
 * (NFR-X-04).
 *
 * The check runs in a microtask after the paint, not in it: a custom element
 * built on a library such as Lit renders what its `props` asks for in a
 * microtask of its own, queued before this one. An item no longer in the
 * document by then is not checked; each item is checked against the node it
 * last rendered.
 */
function checker(raise: (diagnostic: Diagnostic) => void, tree: ShadowRoot): Check {
  const raised = new Set<string>();
  const due = new Map<string, readonly [ViewNode, Element]>();
  const run = () => {
    for (const [node, item] of due.values()) {
      if (!item.isConnected) continue;
      const { ids } = node;
      const control = tree.getElementById(ids.control);
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
        const diagnostic: Diagnostic = { code: 'control-contract', severity: 'warning', path: node.path, detail: node.control, expected, related: [] };
        raise(diagnostic);
        console.warn(`fhirq: ${diagnostic.code} (${node.control})`);
      }
    }
    due.clear();
  };
  return (node, item) => {
    if (due.size === 0) queueMicrotask(run);
    due.set(node.path, [node, item]);
  };
}

/**
 * The check's factory in a development build, `undefined` in production.
 * Written out whole, so a bundler's define folds it and a production build,
 * the script-tag bundle among them, drops the check; without a bundler or
 * Node there is no `process`, and no check.
 */
export const contractCheck: ((raise: (diagnostic: Diagnostic) => void, tree: ShadowRoot) => Check) | undefined = (() => {
  try {
    return process.env.NODE_ENV !== 'production' ? checker : undefined;
  } catch {
    return undefined;
  }
})();
