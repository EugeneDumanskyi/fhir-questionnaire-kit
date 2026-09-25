/**
 * The patcher's primitives. Each writes only when the DOM differs from what it
 * is asked for, so an unchanged attribute costs a read and never a mutation.
 * None of them touches `style` (ADR-0014).
 */

/** A new element with its class and `part` (DOM contract §1), inserted into `parent` before `before` when given one. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  part: string,
  parent?: Node,
  before: Node | null = null,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.setAttribute('part', part);
  parent?.insertBefore(node, before);
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

/** An empty text node appended to `parent`, for `text` to fill. */
export const textIn = (parent: Node): Text => parent.appendChild(document.createTextNode(''));

/** Puts `node` into `parent` before `before` while `shown`, and takes it out otherwise. */
export function show(node: Element, shown: boolean, parent: Node, before: Node | null): void {
  if (shown !== node.isConnected) {
    if (shown) parent.insertBefore(node, before);
    else node.remove();
  }
}

/** The events the element's parts handle. */
export type EventName = 'input' | 'change' | 'click' | 'focusout';
type Handlers = Partial<Record<EventName, (event: Event) => void>>;

const handlers = new WeakMap<EventTarget, Handlers>();

/**
 * Gives `node` its handlers. A part never adds a listener: the element's
 * shadow root listens once per event, for as long as it is connected, and
 * `dispatch` finds the handlers from there. A host's control is the one
 * exception, and says why (`kinds.ts`). A handler reads the view its part
 * last rendered, so it is set once, when the part is built.
 */
export function on(node: EventTarget, table: Handlers): void {
  handlers.set(node, table);
}

/** Runs the handlers for `event` on its target, then on each ancestor, as the event bubbled. */
export function dispatch(event: Event): void {
  for (let node = event.target instanceof Node ? event.target : null; node !== null; node = node.parentNode) {
    handlers.get(node)?.[event.type as EventName]?.(event);
  }
}
