import type { Answer } from '../kernel/answer.js';
import { slot } from '../kernel/dense.js';
import { childPath, instancePath, type ItemPath } from '../kernel/path.js';
import type { Definition, ItemDef } from '../definition/compile.js';

/**
 * The session's stored state (`04-domain.md` §9.3 property 1): item nodes with
 * their answers, repeat instances with ordinals and positions, and the
 * surfacing flag. Everything else on a node — its own condition and effective
 * enablement — is derived, and kept here only so a cycle can tell what changed.
 *
 * Mutable, and private to the session: nothing outside `session/` holds a
 * `ItemNode`. What the host sees is published separately (`publish.ts`).
 */

export interface ItemNode {
  readonly path: ItemPath;
  readonly def: ItemDef;
  /** The node this one sits under: a group, or for an instance's children the repeating group. */
  readonly parent: ItemNode | null;
  /** The repeat instance this node belongs to directly, when its parent is a repeating group. */
  readonly instance: Instance | null;
  /** Creation order; breaks rank ties in the settle heap. */
  readonly sequence: number;
  answers: readonly Answer[];
  own: boolean;
  effective: boolean;
  /** SM-03: `true` once *Live*, and never back. */
  surfaced: boolean;
  /** Children of a group that does not repeat, in document order. */
  readonly children: ItemNode[];
  /** Live instances of a repeating group, in position order (INV-S-21). */
  readonly instances: Instance[];
  /** The next ordinal to hand out; ordinals are never reused (INV-S-20). */
  nextOrdinal: number;
  destroyed: boolean;
  /** The last cycle this node was queued in, so it is queued at most once per cycle. */
  queuedIn: number;
}

export interface Instance {
  readonly ordinal: number;
  readonly path: ItemPath;
  readonly group: ItemNode;
  readonly children: ItemNode[];
}

export interface Store {
  readonly definition: Definition;
  /** Stored verbatim for emission (M3); never read or invented here (INV-S-32). */
  readonly hostIdentity: object | null;
  readonly roots: ItemNode[];
  readonly byPath: Map<ItemPath, ItemNode>;
  /** Every live node of each item definition, by definition id. */
  readonly byDef: readonly Set<ItemNode>[];
  sequence: number;
}

export function createStore(definition: Definition, hostIdentity: object | null): Store {
  const store: Store = {
    definition,
    hostIdentity,
    roots: [],
    byPath: new Map(),
    byDef: definition.items.map(() => new Set<ItemNode>()),
    sequence: 0,
  };
  for (const root of definition.roots) store.roots.push(createNode(store, slot(definition.items, root), null, null));
  return store;
}

/** A node and its whole subtree; a repeating group starts with one empty instance (INV-S-24). */
export function createNode(store: Store, def: ItemDef, parent: ItemNode | null, instance: Instance | null): ItemNode {
  const container = instance?.path ?? parent?.path ?? null;
  const node: ItemNode = {
    path: childPath(container, def.linkId),
    def,
    parent,
    instance,
    sequence: store.sequence,
    answers: [],
    own: false,
    effective: false,
    surfaced: false,
    children: [],
    instances: [],
    nextOrdinal: 0,
    destroyed: false,
    queuedIn: -1,
  };
  store.sequence += 1;
  store.byPath.set(node.path, node);
  slot(store.byDef, def.id).add(node);
  if (isRepeatingGroup(def)) {
    addInstance(store, node);
  } else {
    for (const child of def.children) node.children.push(createNode(store, slot(store.definition.items, child), node, null));
  }
  return node;
}

export function isRepeatingGroup(def: ItemDef): boolean {
  return def.type === 'group' && def.repeats;
}

/** Appends a new empty instance with the next never-used ordinal (INV-S-20). */
export function addInstance(store: Store, group: ItemNode): Instance {
  const ordinal = group.nextOrdinal;
  group.nextOrdinal += 1;
  const instance: Instance = { ordinal, path: instancePath(group.path, ordinal), group, children: [] };
  group.instances.push(instance);
  for (const child of group.def.children) {
    instance.children.push(createNode(store, slot(store.definition.items, child), group, instance));
  }
  return instance;
}

/** Removes an instance and destroys its nodes and their answers (INV-S-25). Positions close up (INV-S-21). */
export function removeInstance(store: Store, instance: Instance): void {
  const { instances } = instance.group;
  instances.splice(instances.indexOf(instance), 1);
  for (const child of instance.children) destroy(store, child);
}

function destroy(store: Store, node: ItemNode): void {
  node.destroyed = true;
  store.byPath.delete(node.path);
  slot(store.byDef, node.def.id).delete(node);
  for (const child of childNodes(node)) destroy(store, child);
}

/** A node's children in document order: a group's children, or every instance's children in position order. */
export function childNodes(node: ItemNode): ItemNode[] {
  return node.instances.length === 0 ? node.children : node.instances.flatMap((instance) => instance.children);
}

/** Every node in document order: pre-order, instances in position order. */
export function inDocumentOrder(store: Store): ItemNode[] {
  const out: ItemNode[] = [];
  const visit = (node: ItemNode): void => {
    out.push(node);
    for (const child of childNodes(node)) visit(child);
  };
  for (const root of store.roots) visit(root);
  return out;
}

/** The instance of repeating group `scope` that `node` sits in, or `null` if it sits in none. */
function enclosingInstance(node: ItemNode, scope: number): Instance | null {
  for (let current: ItemNode | null = node; current !== null; current = current.parent) {
    if (current.instance?.group.def.id === scope) return current.instance;
  }
  return null;
}

/**
 * The question node a dependent node's condition reads (INV-D-13, INV-S-08):
 * the single node of a question outside every repeat, or the question's node
 * in the instance of its repeating group that the dependent shares.
 */
export function questionNode(store: Store, dependent: ItemNode, question: number): ItemNode | undefined {
  const scope = slot(store.definition.items, question).repeatScope;
  if (scope === -1) return first(slot(store.byDef, question));
  const instance = enclosingInstance(dependent, scope);
  return instance === null ? undefined : descend(store, instance.children, scope, question)[0];
}

/**
 * The nodes that read `question` through a dependency edge: every node of the
 * dependent item for a global edge, or only those in the question's own
 * instance of the scope group.
 */
export function dependentNodes(store: Store, question: ItemNode): ItemNode[] {
  return question.def.dependents.flatMap((edge) => {
    if (edge.scope === -1) return [...slot(store.byDef, edge.dependent)];
    const instance = enclosingInstance(question, edge.scope);
    return instance === null ? [] : descend(store, instance.children, edge.scope, edge.dependent);
  });
}

/**
 * The nodes of item `target` under an instance of group `scope`, found by
 * walking the definition path down from the instance. A repeating group on
 * the way contributes every one of its instances.
 */
function descend(store: Store, children: readonly ItemNode[], scope: number, target: number): ItemNode[] {
  const chain: number[] = [];
  for (let id = target; id !== scope; id = slot(store.definition.items, id).parent) chain.unshift(id);
  let level: readonly ItemNode[] = children;
  for (const [step, id] of chain.entries()) {
    const matches = level.filter((node) => node.def.id === id);
    if (step === chain.length - 1) return matches;
    level = matches.flatMap(childNodes);
  }
  return [];
}

function first(nodes: ReadonlySet<ItemNode>): ItemNode | undefined {
  for (const node of nodes) return node;
  return undefined;
}
