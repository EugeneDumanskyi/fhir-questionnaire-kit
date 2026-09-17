import { describe, expect, it } from 'vitest';

import { MinHeap } from '../../src/session/heap.js';

describe('the settle heap (ADR-0009)', () => {
  it('pops in order whatever the push order, and is empty after', () => {
    let seed = 7;
    const random = () => (seed = (seed * 48_271) % 2_147_483_647);
    const values = Array.from({ length: 500 }, () => random() % 100);
    const heap = new MinHeap<number>((a, b) => a < b);
    for (const value of values) heap.push(value);
    const popped: number[] = [];
    for (let value = heap.pop(); value !== undefined; value = heap.pop()) popped.push(value);
    expect(popped).toEqual([...values].sort((a, b) => a - b));
    expect(heap.pop()).toBeUndefined();
  });

  it('breaks ties with the comparison it was given', () => {
    const heap = new MinHeap<[rank: number, sequence: number]>((a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]));
    for (const entry of [[1, 3], [0, 9], [1, 1], [1, 2]] as const) heap.push([...entry]);
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([[0, 9], [1, 1], [1, 2], [1, 3]]);
  });
});
