import { ownCondition, type QuestionState } from './conditions.js';
import { MinHeap } from './heap.js';
import { childNodes, dependentNodes, inDocumentOrder, questionNode, type ItemNode, type Store } from './store.js';

/**
 * ADR-0009 cycle step 3: settle enablement.
 *
 * Dirty nodes are popped in rank order. For each, its own condition is
 * recomputed against effectively enabled questions only (INV-S-04, in
 * `conditions.ts`) and its effective enablement from its parent (INV-S-01).
 * If either changed, its children and its dependents are queued, resolved in
 * the scope of their edge. Ranks strictly increase along every edge, so a node
 * is popped after everything it reads has settled, and at most once.
 *
 * Retention (SM-02) happens as a node flips: under `discard`, a node that
 * becomes disabled loses its answers in this same cycle (INV-S-13).
 */

export type RetentionPolicy = 'retain-exclude' | 'discard';

export interface Settlement {
  /** Every node the heap popped: the recompute set that NFR-P-09 asserts. */
  readonly recomputed: readonly ItemNode[];
  /** Nodes whose effective enablement changed. */
  readonly flipped: readonly ItemNode[];
  /** Whether `discard` erased any answer. */
  readonly erased: boolean;
}

const settleOrder = (a: ItemNode, b: ItemNode): boolean =>
  a.def.rank < b.def.rank || (a.def.rank === b.def.rank && a.sequence < b.sequence);

/**
 * Settles from `seeds` for cycle number `cycle`. At session creation the seeds
 * are every node, which is the one non-incremental walk ADR-0009 accepts.
 */
export function settle(store: Store, retention: RetentionPolicy, cycle: number, seeds: Iterable<ItemNode>): Settlement {
  const heap = new MinHeap<ItemNode>(settleOrder);
  const queue = (node: ItemNode): void => {
    if (node.queuedIn === cycle || node.destroyed) return;
    node.queuedIn = cycle;
    heap.push(node);
  };
  for (const seed of seeds) queue(seed);

  const recomputed: ItemNode[] = [];
  const flipped: ItemNode[] = [];
  let erased = false;
  for (let node = heap.pop(); node !== undefined; node = heap.pop()) {
    if (node.destroyed) continue;
    recomputed.push(node);
    const own = ownCondition(node.def, (question) => readQuestion(store, node, question));
    const effective = own && (node.parent === null || node.parent.effective);
    if (own === node.own && effective === node.effective) continue;

    node.own = own;
    if (effective !== node.effective) {
      node.effective = effective;
      flipped.push(node);
      if (!effective && retention === 'discard' && node.answers.length > 0) {
        node.answers = [];
        erased = true;
      }
    }
    for (const child of childNodes(node)) queue(child);
    for (const dependent of dependentNodes(store, node)) queue(dependent);
  }
  return { recomputed, flipped, erased };
}

/**
 * Settles a freshly created store. Every node is a seed, so every node is
 * popped once in rank order whether or not it changes from the initial
 * "not own, not effective".
 */
export function settleInitial(store: Store, retention: RetentionPolicy): void {
  settle(store, retention, 0, inDocumentOrder(store));
}

/** How a dependent reads its question: effective enablement and answers, nothing else. */
export function readQuestion(store: Store, dependent: ItemNode, question: number): QuestionState {
  const node = questionNode(store, dependent, question);
  return node === undefined ? { enabled: false, answers: [] } : { enabled: node.effective, answers: node.answers };
}
