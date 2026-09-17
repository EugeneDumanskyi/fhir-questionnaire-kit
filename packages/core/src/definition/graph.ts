import { slot } from '../kernel/dense.js';
import { diagnostic } from '../kernel/diagnostic.js';
import type { Finding, DraftItem } from './checks.js';
import type { DependencyEdge } from './compile.js';
import { findCycles } from './scc.js';

/** NFR-P-05: group nesting and `enableWhen` chain depth, confirmed by S0. */
export const NESTING_CEILING = 10;
export const CHAIN_CEILING = 10;

export interface Graph {
  /** By question id: the items whose conditions read it. */
  readonly dependents: readonly (readonly DependencyEdge[])[];
  /** By item id. All `0` when the graph has a cycle, since nothing will run. */
  readonly ranks: readonly number[];
  readonly findings: readonly Finding[];
}

/**
 * ADR-0009 load steps 2–4: dependency edges labelled with their scope, plus the
 * tree edges; Tarjan over both (INV-D-05); topological ranks; and the depth
 * ceilings (INV-D-07). A group whose condition reads its own descendant is a
 * cycle through a tree edge, and is rejected like any other: it could never
 * become enabled.
 */
export function buildGraph(items: readonly DraftItem[]): Graph {
  const dependents = dependencyEdges(items);
  const adjacency = items.map((item, id) => [...item.children, ...slot(dependents, id).map((edge) => edge.dependent)]);

  const cycles = findCycles(adjacency);
  const findings: Finding[] = [...cycles.map((cycle) => cycleFinding(cycle, items)), ...nestingFindings(items)];
  if (cycles.length > 0) return { dependents, ranks: items.map(() => 0), findings };

  const order = topologicalOrder(adjacency);
  const ranks = items.map(() => 0);
  const chains = items.map(() => 0);
  for (const id of order) {
    for (const target of slot(adjacency, id)) ranks[target] = Math.max(slot(ranks, target), slot(ranks, id) + 1);
    for (const edge of slot(dependents, id)) chains[edge.dependent] = Math.max(slot(chains, edge.dependent), slot(chains, id) + 1);
  }
  for (const id of order) {
    if (chains[id] === CHAIN_CEILING + 1) findings.push(tooDeep('chain-too-deep', slot(items, id)));
  }
  return { dependents, ranks, findings };
}

/** One edge per question and dependent, however many conditions repeat the pair. */
function dependencyEdges(items: readonly DraftItem[]): DependencyEdge[][] {
  const dependents = items.map((): DependencyEdge[] => []);
  for (const item of items) {
    const questions = new Set(item.conditions.flatMap((condition) => (condition.kind === 'test' ? [condition.question] : [])));
    for (const question of questions) {
      slot(dependents, question).push({ dependent: item.id, scope: slot(items, question).repeatScope });
    }
  }
  return dependents;
}

/** INV-D-05: the error names every linkId in the cycle, in document order. */
function cycleFinding(cycle: readonly number[], items: readonly DraftItem[]): Finding {
  const members = cycle.map((id) => slot(items, id));
  return {
    rejects: 'always',
    diagnostic: diagnostic('dependency-cycle', 'error', slot(members, 0).path, { related: members.map((member) => member.linkId) }),
  };
}

/** INV-D-07: one finding at each group that is the first past the nesting ceiling on its branch. */
function nestingFindings(items: readonly DraftItem[]): Finding[] {
  const nesting = items.map(() => 0);
  const out: Finding[] = [];
  for (const item of items) {
    const above = item.parent === -1 ? 0 : slot(nesting, item.parent);
    nesting[item.id] = above + (item.type === 'group' ? 1 : 0);
    if (item.type === 'group' && above === NESTING_CEILING) out.push(tooDeep('nesting-too-deep', item));
  }
  return out;
}

function tooDeep(code: 'chain-too-deep' | 'nesting-too-deep', item: DraftItem): Finding {
  return { rejects: 'always', diagnostic: diagnostic(code, 'error', item.path) };
}

/** Kahn's algorithm, sources taken in id (document) order. The graph is known to be acyclic here. */
function topologicalOrder(adjacency: readonly (readonly number[])[]): number[] {
  const incoming = adjacency.map(() => 0);
  for (const targets of adjacency) for (const target of targets) incoming[target] = slot(incoming, target) + 1;
  const order = incoming.flatMap((count, id) => (count === 0 ? [id] : []));
  for (let next = 0; next < order.length; next += 1) {
    for (const target of slot(adjacency, slot(order, next))) {
      incoming[target] = slot(incoming, target) - 1;
      if (incoming[target] === 0) order.push(target);
    }
  }
  return order;
}
