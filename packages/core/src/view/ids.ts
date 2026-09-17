/**
 * Path-derived ids (INV-P-02). A path is escaped so the id is a single token
 * that is safe in an id attribute and a fragment: `[A-Za-z0-9.-]` passes
 * through and every other code point becomes `_<hex>_`, `_` included, so two
 * paths can never produce the same id. Each node id ends in a suffix that
 * contains no `-`, so a node id cannot collide with another node's or with the
 * form-level ids.
 */
export function pathId(path: string): string {
  let out = '';
  for (const char of path) {
    out += /^[A-Za-z0-9.-]$/.test(char) ? char : `_${(char.codePointAt(0) ?? 0).toString(16)}_`;
  }
  return out;
}

/** @alpha */
export interface NodeIds {
  readonly control: string;
  readonly label: string;
  readonly description: string;
  readonly error: string;
}

export function nodeIds(prefix: string, path: string): NodeIds {
  const base = `${prefix}-${pathId(path)}`;
  return {
    control: `${base}-control`,
    label: `${base}-label`,
    description: `${base}-description`,
    error: `${base}-error`,
  };
}
