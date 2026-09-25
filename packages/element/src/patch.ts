/**
 * The element's one keyed reconciler (ADR-0007, M7 plan step 3a). Every list
 * of children it renders goes through `patch`: the form's items, the error
 * summary's entries and an item's issues, and the kind descriptors' lists
 * after them (step 3b).
 *
 * - **Keyed.** A child keeps its record, and so its DOM, while its key stays
 *   in the list: an item path, an instance path, an option key or a position.
 *   A key names whatever the child cannot change in place, since a new key is
 *   a new child. A key that repeats is told apart by its occurrence, so no
 *   two children ever share a record.
 * - **Skipped by reference.** A child whose view is the object it last
 *   rendered is not touched. The view renews a node only when it or something
 *   under it changed (M5 plan D1), so an unchanged node costs no mutation.
 * - **Minimal.** Stale children are removed and new ones inserted. A child
 *   already in place is never re-inserted. The view never reorders a list, so
 *   in practice nothing moves, and the moves a reordered list would need are
 *   not minimised.
 * - **Focus-safe.** The child that holds focus is never moved: its siblings
 *   are placed around it. A move removes and re-inserts a node, which blurs
 *   whatever is focused inside it in every engine (NFR-A-07, M7 AC-5). A
 *   child that has left the list is removed even when it holds focus, since
 *   what it showed is gone.
 */

/** A child as its list's `create` builds it: a root, and how the root is brought in line with a view. */
export interface Part<V, C> {
  readonly root: Element;
  /**
   * Writes what differs between the DOM and `view`, which may be the view
   * `create` was given. `cx` is the list's shared context: a child skipped by
   * reference never sees a new one, so it holds only what is fixed for a
   * view's life, such as the required marker.
   */
  readonly update: (view: V, cx: C) => void;
}

/** How one list is keyed, and how a child's fixed structure is built; `update` then fills it in. */
export interface List<V, C> {
  readonly key: (view: V, index: number) => string;
  readonly create: (view: V, cx: C) => Part<V, C>;
}

/** A child's record: its part, and the view it last rendered. */
export interface Keyed<V, C> extends Part<V, C> {
  view: V;
}

/** A list's records by key, as `patch` returns them, to be handed back to it next time. */
export type Records<V, C> = ReadonlyMap<string, Keyed<V, C>>;

/**
 * Brings the children of `parent` that sit before `end` in line with `views`,
 * and returns the records for the next call. Children outside that range,
 * such as a legend before it or the form's status after it, are not touched.
 */
export function patch<V, C>(parent: Node, records: Records<V, C>, views: readonly V[], list: List<V, C>, cx: NoInfer<C>, end: Node | null = null): Records<V, C> {
  const next = new Map<string, Keyed<V, C>>();
  views.forEach((view, index) => {
    let key = list.key(view, index);
    while (next.has(key)) key += '\0';
    let record = records.get(key);
    if (record === undefined) {
      record = { ...list.create(view, cx), view };
      record.update(view, cx);
    } else if (record.view !== view) {
      record.update(view, cx);
      record.view = view;
    }
    next.set(key, record);
  });
  for (const [key, record] of records) if (!next.has(key)) record.root.remove();

  // Right to left, each child just before its successor, so a child already
  // there costs nothing. The focused child stays put and becomes the
  // successor of the one before it.
  const focused = focusedChild(parent);
  let successor = end;
  for (const { root } of [...next.values()].reverse()) {
    if (root !== focused && (root.parentNode !== parent || root.nextSibling !== successor)) parent.insertBefore(root, successor);
    successor = root;
  }
  return next;
}

/**
 * The child of `parent` that holds focus, if any. Read from the root
 * `parent` is in, so focus inside the element's shadow root is seen; a
 * subtree not yet inserted has none.
 */
function focusedChild(parent: Node): Node | null {
  let node: Node | null = (parent.getRootNode() as Partial<DocumentOrShadowRoot>).activeElement ?? null;
  while (node !== null && node.parentNode !== parent) node = node.parentNode;
  return node;
}
