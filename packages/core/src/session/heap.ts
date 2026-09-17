/**
 * A binary min-heap (ADR-0009 settle step). The session pops dirty nodes in
 * rank order; ties break on creation order, so the pop sequence is fully
 * determined by the graph and never by insertion order.
 */
export class MinHeap<T> {
  readonly #items: T[] = [];
  readonly #before: (a: T, b: T) => boolean;

  constructor(before: (a: T, b: T) => boolean) {
    this.#before = before;
  }

  push(item: T): void {
    const items = this.#items;
    items.push(item);
    let child = items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.#before(items[child] as T, items[parent] as T)) break;
      this.#swap(child, parent);
      child = parent;
    }
  }

  pop(): T | undefined {
    const items = this.#items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || last === undefined) return top;
    items[0] = last;
    let parent = 0;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < items.length && this.#before(items[left] as T, items[smallest] as T)) smallest = left;
      if (right < items.length && this.#before(items[right] as T, items[smallest] as T)) smallest = right;
      if (smallest === parent) return top;
      this.#swap(parent, smallest);
      parent = smallest;
    }
  }

  #swap(a: number, b: number): void {
    const items = this.#items;
    const held = items[a] as T;
    items[a] = items[b] as T;
    items[b] = held;
  }
}
