import type { Answer } from '../kernel/answer.js';
import type { Issue } from '../kernel/issue.js';
import type { ItemType, LinkId } from '../kernel/item-type.js';
import type { ItemPath } from '../kernel/path.js';
import type { ItemDef } from '../definition/compile.js';
import { childNodes, type ItemNode, type Store } from './store.js';

/**
 * ADR-0009 cycle step 6: publish. Hosts and the view model read immutable
 * per-node objects; a node whose visible state did not change keeps its
 * object, and the node list keeps its array when no node changed, which is
 * what `useSyncExternalStore`, `React.memo` and the element's keyed patcher
 * need.
 */

/**
 * What a host may know about an item's definition. Built once per item; the
 * compiled definition's graph internals are not part of it.
 *
 * @alpha M2 fixes the surface in `docs/07-api.md`.
 */
export interface ItemDefinition {
  readonly linkId: LinkId;
  /** `null` for an unsupported item kept as a placeholder in lenient mode. */
  readonly type: ItemType | null;
  readonly text: string;
  readonly required: boolean;
  readonly repeats: boolean;
  /** Bound to an expression; answer commands are refused (ADR-0003). */
  readonly calculated: boolean;
  readonly options: readonly Answer[];
  readonly valueSet: string | null;
  readonly itemControl: string | null;
  readonly maxLength: number | null;
  readonly minOccurs: number;
  readonly maxOccurs: number | null;
}

/**
 * An effectively enabled item node. Object identity is kept across cycles
 * while nothing about it changed.
 *
 * @alpha M2 fixes the surface in `docs/07-api.md`.
 */
export interface NodeState {
  readonly path: ItemPath;
  readonly item: ItemDefinition;
  readonly answers: readonly Answer[];
  /** A repeating group's live instance ordinals, in position order; empty for any other node. */
  readonly instances: readonly number[];
  /** Every current issue, surfaced or not. */
  readonly issues: readonly Issue[];
  /** SM-03: `true` once *Live*, and never back. */
  readonly surfaced: boolean;
}

const NONE: readonly never[] = [];

export function publicItem(def: ItemDef): ItemDefinition {
  return {
    linkId: def.linkId,
    type: def.type,
    text: def.text,
    required: def.required,
    repeats: def.repeats,
    calculated: def.calculated,
    options: def.options,
    valueSet: def.valueSet,
    itemControl: def.itemControl,
    maxLength: def.maxLength,
    minOccurs: def.minOccurs,
    maxOccurs: def.maxOccurs,
  };
}

/** Effectively enabled nodes in document order. A disabled node's subtree is skipped whole (INV-S-01). */
export function visibleNodes(store: Store): ItemNode[] {
  const out: ItemNode[] = [];
  const visit = (node: ItemNode): void => {
    if (!node.effective) return;
    out.push(node);
    for (const child of childNodes(node)) visit(child);
  };
  for (const root of store.roots) visit(root);
  return out;
}

export function publishNodes(
  visible: readonly ItemNode[],
  items: readonly ItemDefinition[],
  issues: ReadonlyMap<ItemPath, readonly Issue[]>,
  previous: readonly NodeState[],
): readonly NodeState[] {
  const before = new Map(previous.map((state) => [state.path, state]));
  let reused = visible.length === previous.length;
  const nodes = visible.map((node, index): NodeState => {
    const old = before.get(node.path);
    const nodeIssues = issues.get(node.path) ?? NONE;
    const ordinals = node.instances.map((instance) => instance.ordinal);
    if (
      old !== undefined &&
      old.answers === node.answers &&
      old.surfaced === node.surfaced &&
      sameIssues(old.issues, nodeIssues) &&
      sameNumbers(old.instances, ordinals)
    ) {
      if (previous[index] !== old) reused = false;
      return old;
    }
    reused = false;
    return {
      path: node.path,
      item: items[node.def.id] as ItemDefinition,
      answers: node.answers,
      instances: ordinals.length === 0 ? NONE : ordinals,
      issues: nodeIssues,
      surfaced: node.surfaced,
    };
  });
  return reused ? previous : nodes;
}

function sameIssues(a: readonly Issue[], b: readonly Issue[]): boolean {
  return a.length === b.length && a.every((issue, index) => issue.code === b[index]?.code);
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
