import type { Evaluation, ModelCommand, Oracle } from './oracle.js';

/**
 * NFR-P-09's independent check (ADR-0009 as amended by M2 plan D15): from the
 * oracle's whole before-state and after-state, which nodes a correct
 * incremental cycle must re-evaluate.
 *
 * - `closure` is every node transitively reachable from the change over
 *   scoped dependency edges and tree edges: the most a cycle may touch.
 * - `pruned` is the breadth-first search that expands a node only when its
 *   own condition or effective enablement differs between before and after:
 *   exactly what ADR-0009's settle step pops.
 *
 * Edges are found from paths, through `Oracle.questionPath`, never from the
 * engine's compiled graph.
 */
export function expectedRecompute(
  oracle: Oracle,
  command: ModelCommand,
  answersChanged: boolean,
  before: Evaluation,
  after: Evaluation,
): { readonly pruned: ReadonlySet<string>; readonly closure: ReadonlySet<string> } {
  const dependents = (path: string): string[] =>
    after.order.filter((candidate) =>
      (after.nodes.get(candidate)?.item.enableWhen ?? []).some((condition) => oracle.questionPath(candidate, condition.question) === path),
    );
  const subtree = (path: string): string[] => [path, ...(after.nodes.get(path)?.children ?? []).flatMap(subtree)];

  const seeds: string[] = [];
  if ((command.type === 'SetAnswer' || command.type === 'ClearAnswer') && answersChanged) seeds.push(...dependents(command.path));
  if (command.type === 'AddRepeatInstance') {
    for (const child of after.nodes.get(command.path)?.children ?? []) if (!before.nodes.has(child)) seeds.push(...subtree(child));
  }

  const search = (prune: boolean): Set<string> => {
    const seen = new Set<string>();
    const queue = [...seeds];
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      if (seen.has(path) || !after.nodes.has(path)) continue;
      seen.add(path);
      const changed = !before.nodes.has(path) || before.own.get(path) !== after.own.get(path) || before.effective.get(path) !== after.effective.get(path);
      if (prune && !changed) continue;
      for (const child of after.nodes.get(path)?.children ?? []) {
        // Nodes a `discard` reset created are all queued by the engine, whether or not they change.
        if (!before.nodes.has(child)) queue.push(...subtree(child));
        else queue.push(child);
      }
      queue.push(...dependents(path));
    }
    return seen;
  };
  return { pruned: search(true), closure: search(false) };
}
