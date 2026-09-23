import type { SessionState } from '../index.js';
import type { ErrorSummary, FocusTarget, InstanceView, ViewNode } from './types.js';

/**
 * Where focus goes after a cycle (ADR-0007, M5 plan D12):
 * - a refused completion: the error summary (AC-11.3.1);
 * - an added instance: its first control (AC-03.2.1);
 * - a removed instance: the first control of the instance that took its
 *   place, else of the one before it, else the group's add control.
 * Any other cycle moves nothing.
 */
export function focusAfter(
  state: SessionState,
  now: ReadonlyMap<string, ViewNode | InstanceView>,
  before: ReadonlyMap<string, ViewNode | InstanceView>,
  summary: ErrorSummary | null,
): FocusTarget | null {
  const { change, cycle } = state;
  const [added] = change?.added ?? [];
  const [removed] = change?.removed ?? [];
  const instance = added === undefined ? undefined : now.get(added);
  const id =
    change?.completion === 'refused'
      ? summary?.id
      : instance !== undefined && 'number' in instance
        ? firstControl(instance)
        : removed === undefined
          ? undefined
          : afterRemoval(removed, now, before);
  return id === undefined ? null : { id, cycle };
}

/** The instance that took the removed one's place, else the one before it, else the group's add control. */
function afterRemoval(removed: string, now: ReadonlyMap<string, ViewNode | InstanceView>, before: ReadonlyMap<string, ViewNode | InstanceView>): string | undefined {
  const groupPath = removed.slice(0, removed.lastIndexOf('['));
  const group = now.get(groupPath);
  const old = before.get(groupPath);
  if (group === undefined || !('instances' in group) || old === undefined || !('instances' in old)) return undefined;
  const at = old.instances.findIndex((candidate) => candidate.path === removed);
  const neighbour = group.instances[at] ?? group.instances[at - 1];
  return neighbour === undefined ? group.ids.control : firstControl(neighbour);
}

/** The first control in an instance, in document order; its remove control when it has none. */
function firstControl(instance: InstanceView): string {
  return firstIn(instance.children) ?? instance.ids.control;
}

function firstIn(nodes: readonly ViewNode[]): string | null {
  for (const node of nodes) {
    if (node.control === 'group') {
      const inner = firstIn(node.children);
      if (inner !== null) return inner;
    } else if (node.control === 'repeating-group') {
      const [first] = node.instances;
      return first === undefined ? node.ids.control : firstControl(first);
    } else if ('set' in node) {
      return node.ids.control;
    }
  }
  return null;
}
