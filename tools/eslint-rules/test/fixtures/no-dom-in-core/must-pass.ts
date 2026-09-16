// MUST PASS: state, paths and codes, with nothing that implies a browser.

export interface ItemNode {
  readonly path: string;
  readonly enabled: boolean;
}

export function firstInvalidPath(nodes: readonly ItemNode[]): string | undefined {
  // A local binding may be called `document`: the rule reads scope, not spelling.
  const document = { pages: nodes.length };
  return document.pages > 0 ? nodes[0]?.path : undefined;
}
