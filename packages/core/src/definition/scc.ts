import { slot } from '../kernel/dense.js';

/**
 * Tarjan's strongly-connected-components algorithm (ADR-0009, load step 3),
 * iterative so a 1,000-item chain cannot exhaust the call stack. Nodes are the
 * dense ids `0 … n-1`; `adjacency[v]` lists the targets of `v`'s edges.
 *
 * Returns only the components that are cycles: more than one member, or one
 * member with an edge to itself. Members are sorted by id, which is document
 * order, so a cycle error names them the way an author reads the form.
 */
export function findCycles(adjacency: readonly (readonly number[])[]): number[][] {
  const count = adjacency.length;
  const index: number[] = new Array<number>(count).fill(-1);
  const low: number[] = new Array<number>(count).fill(0);
  const onStack: boolean[] = new Array<boolean>(count).fill(false);
  const stack: number[] = [];
  const cycles: number[][] = [];
  let counter = 0;

  const visit = (node: number, work: { node: number; next: number }[]): void => {
    index[node] = counter;
    low[node] = counter;
    counter += 1;
    stack.push(node);
    onStack[node] = true;
    work.push({ node, next: 0 });
  };

  for (let root = 0; root < count; root += 1) {
    if (slot(index, root) !== -1) continue;
    const work: { node: number; next: number }[] = [];
    visit(root, work);
    for (let frame = work.at(-1); frame !== undefined; frame = work.at(-1)) {
      const edges = slot(adjacency, frame.node);
      const target = edges[frame.next];
      if (target !== undefined) {
        frame.next += 1;
        if (slot(index, target) === -1) {
          visit(target, work);
        } else if (onStack[target] === true) {
          low[frame.node] = Math.min(slot(low, frame.node), slot(index, target));
        }
        continue;
      }
      work.pop();
      const parent = work.at(-1);
      if (parent !== undefined) low[parent.node] = Math.min(slot(low, parent.node), slot(low, frame.node));
      if (slot(low, frame.node) === slot(index, frame.node)) {
        const component = popComponent(stack, onStack, frame.node);
        if (component.length > 1 || edges.includes(frame.node)) cycles.push(component.sort((a, b) => a - b));
      }
    }
  }
  return cycles.sort((a, b) => slot(a, 0) - slot(b, 0));
}

function popComponent(stack: number[], onStack: boolean[], root: number): number[] {
  const component: number[] = [];
  for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
    onStack[member] = false;
    component.push(member);
    if (member === root) break;
  }
  return component;
}
