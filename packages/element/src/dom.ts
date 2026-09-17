/**
 * The patcher's primitives. Each writes only when the DOM differs from what it
 * is asked for, so an unchanged attribute costs a read and never a mutation.
 * None of them touches `style` (ADR-0014).
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  part: string,
  parent?: Node,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute('part', part);
  parent?.appendChild(node);
  return node;
}

export function attr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}

export function text(node: Text, value: string): void {
  if (node.data !== value) node.data = value;
}
