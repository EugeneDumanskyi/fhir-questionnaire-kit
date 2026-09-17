import { describe, expect, it } from 'vitest';

import { findCycles } from '../../src/definition/scc.js';

describe('Tarjan cycle detection (ADR-0009, INV-D-05)', () => {
  it('finds nothing in a DAG', () => {
    expect(findCycles([[1, 2], [2], [], [0]])).toEqual([]);
  });

  it('finds a self-loop and a two-node cycle, members in id order', () => {
    expect(findCycles([[0], [2], [1]])).toEqual([[0], [1, 2]]);
  });

  it('finds every separate cycle, including one reached late', () => {
    expect(findCycles([[1], [2], [0, 3], [4], [5], [3], []])).toEqual([[0, 1, 2], [3, 4, 5]]);
  });

  it('keeps a cycle whole when it has a branch hanging off it', () => {
    expect(findCycles([[1], [2, 3], [0], []])).toEqual([[0, 1, 2]]);
  });

  it('walks a 20,000-node chain without exhausting the stack', () => {
    const chain = Array.from({ length: 20_000 }, (_, id) => (id + 1 < 20_000 ? [id + 1] : [0]));
    const [cycle] = findCycles(chain);
    expect(cycle).toHaveLength(20_000);
  });
});
