import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { patch, type List, type Records } from '../../src/patch.js';

/**
 * The keyed reconciler on its own (M7 plan step 3a), in an open shadow root
 * as the element uses it. Every list the element renders goes through it, so
 * its rules are proved here once: keys, skipping by reference, the range it
 * owns, and never moving the child that holds focus.
 */

interface Row {
  readonly key: string;
  readonly text: string;
}

const row = (key: string, text = key): Row => ({ key, text });

/** Each call to a child's `update`, by key. */
let updates: string[] = [];

/** A child with a text field in it, so focus can sit inside a child. */
const ROWS: List<Row, string> = {
  key: (view) => view.key,
  create(view) {
    const root = document.createElement('div');
    root.setAttribute('data-key', view.key);
    root.append(document.createElement('input'));
    return {
      root,
      update(next, cx) {
        updates.push(next.key);
        root.setAttribute('title', `${next.text} ${cx}`);
      },
    };
  },
};

describe('the keyed reconciler (patch.ts)', () => {
  let host: HTMLElement;
  let parent: HTMLElement;
  let before: HTMLElement;
  let end: HTMLElement;
  let observer: MutationObserver;
  let records: Records<Row, string>;

  /** The parent's children: a child's key, or the tag of one outside the list. */
  const order = () => [...parent.children].map((child) => child.getAttribute('data-key') ?? child.tagName.toLowerCase());
  const rootOf = (key: string) => parent.querySelector(`[data-key="${key}"]`);
  const inputOf = (key: string) => rootOf(key)?.querySelector('input') ?? null;
  const focused = () => (parent.getRootNode() as ShadowRoot).activeElement;
  /** Whether a mutation since the last look removed or inserted `node`: a move does both. */
  const placed = (mutations: readonly MutationRecord[], node: Node | null) =>
    mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].includes(node as Node));
  const run = (views: readonly Row[], cx = 'cx') => {
    updates = [];
    records = patch(parent, records, views, ROWS, cx, end);
    return observer.takeRecords();
  };

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    const shadow = host.attachShadow({ mode: 'open' });
    parent = shadow.appendChild(document.createElement('div'));
    before = parent.appendChild(document.createElement('header'));
    end = parent.appendChild(document.createElement('footer'));
    records = new Map();
    observer = new MutationObserver(() => undefined);
    observer.observe(parent, { subtree: true, childList: true, attributes: true, characterData: true });
  });

  afterEach(() => {
    observer.disconnect();
    host.remove();
  });

  it('places a list between the children around it, and costs nothing when given the same views again', () => {
    const views = [row('a'), row('b'), row('c')];
    run(views);
    expect(order()).toEqual(['header', 'a', 'b', 'c', 'footer']);
    expect(updates).toEqual(['a', 'b', 'c']);

    expect(run(views)).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('updates only the children whose view is a new object, and hands them the context', () => {
    const [a, b, c] = [row('a'), row('b'), row('c')];
    run([a, b, c]);

    const mutations = run([a, row('b', 'B'), c], 'next');
    expect(updates).toEqual(['b']);
    expect(rootOf('b')?.getAttribute('title')).toBe('B next');
    expect(mutations.map((mutation) => [mutation.type, (mutation.target as Element).getAttribute('data-key')])).toEqual([['attributes', 'b']]);
  });

  it('removes a stale child and inserts a new one in place, keeping every other child’s DOM', () => {
    const [a, b, c] = [row('a'), row('b'), row('c')];
    run([a, b, c]);
    const [kept, gone] = [rootOf('a'), rootOf('b')];

    const mutations = run([a, row('n'), c]);
    expect(order()).toEqual(['header', 'a', 'n', 'c', 'footer']);
    expect(rootOf('a')).toBe(kept);
    expect(gone?.isConnected).toBe(false);
    // One removal and one insertion, both on the parent.
    expect(mutations.map((mutation) => [mutation.removedNodes.length, mutation.addedNodes.length])).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(mutations.every((mutation) => mutation.target === parent)).toBe(true);
  });

  it('appends to the end of the parent when the list has no end', () => {
    end.remove();
    observer.takeRecords();
    updates = [];
    records = patch(parent, records, [row('a'), row('b')], ROWS, 'cx');
    expect(order()).toEqual(['header', 'a', 'b']);
  });

  it('builds a list in a subtree not yet inserted, which has no focus', () => {
    const detached = document.createElement('div');
    patch(detached, new Map(), [row('a'), row('b')], ROWS, 'cx');
    expect([...detached.children].map((child) => child.getAttribute('data-key'))).toEqual(['a', 'b']);
  });

  it('makes a new child for a new key, even at the same position', () => {
    run([row('a')]);
    const first = rootOf('a');
    run([row('z')]);
    expect(order()).toEqual(['header', 'z', 'footer']);
    expect(first?.isConnected).toBe(false);
  });

  it('tells a repeated key apart by its occurrence, and keeps each occurrence’s child', () => {
    const [x1, x2, y] = [row('x', 'first'), row('x', 'second'), row('y')];
    run([x1, x2, y]);
    expect(order()).toEqual(['header', 'x', 'x', 'y', 'footer']);
    const [first, second] = parent.querySelectorAll('[data-key="x"]');

    expect(run([x1, x2, y])).toEqual([]);
    expect(parent.querySelectorAll('[data-key="x"]')[0]).toBe(first);
    expect(parent.querySelectorAll('[data-key="x"]')[1]).toBe(second);
    expect(second?.getAttribute('title')).toBe('second cx');
  });

  it('never touches the children outside its range', () => {
    run([row('a'), row('b')]);
    const mutations = [...run([row('b'), row('c')]), ...run([])];
    expect(order()).toEqual(['header', 'footer']);
    expect(placed(mutations, before)).toBe(false);
    expect(placed(mutations, end)).toBe(false);
  });

  it('moves a child whose place changed, when none holds focus', () => {
    run([row('a'), row('b'), row('c')]);
    const roots = ['a', 'b', 'c'].map(rootOf);
    run([row('c'), row('a'), row('b')]);
    expect(order()).toEqual(['header', 'c', 'a', 'b', 'footer']);
    expect(['a', 'b', 'c'].map(rootOf)).toEqual(roots);
  });

  // A move blurs whatever it moves in every engine, which is why the
  // reconciler never moves the focused child. This proves the check below
  // would see it if it did: the naive move is detected, and focus is lost.
  it('sees a naive move of the focused child as a removal, and it loses focus', () => {
    run([row('a'), row('b')]);
    inputOf('a')?.focus();
    expect(focused()).toBe(inputOf('a'));

    parent.insertBefore(rootOf('a') as Node, end);
    expect(placed(observer.takeRecords(), rootOf('a'))).toBe(true);
    expect(focused()).toBeNull();
  });

  it.each([
    { from: 'abc', to: 'cba', focus: 'b' },
    { from: 'abc', to: 'bac', focus: 'b' },
    { from: 'abc', to: 'bca', focus: 'a' },
    { from: 'abc', to: 'cab', focus: 'c' },
    { from: 'abcd', to: 'dcba', focus: 'c' },
    { from: 'abc', to: 'xcybz', focus: 'b' },
  ])('never moves the child that holds focus: $from to $to with $focus focused', ({ from, to, focus }) => {
    run([...from].map((key) => row(key)));
    const input = inputOf(focus);
    input?.focus();
    expect(focused()).toBe(input);

    const mutations = run([...to].map((key) => row(key)));
    expect(order()).toEqual(['header', ...to, 'footer']);
    expect(placed(mutations, rootOf(focus))).toBe(false);
    expect(focused()).toBe(input);
  });

  it('removes a stale child even when it holds focus, since what it showed is gone', () => {
    run([row('a'), row('b'), row('c')]);
    inputOf('b')?.focus();
    run([row('a'), row('c')]);
    expect(order()).toEqual(['header', 'a', 'c', 'footer']);
    expect(focused()).toBeNull();
  });

  it('keeps the focused child still when siblings are inserted and removed on both sides', () => {
    run([row('a'), row('f'), row('z')]);
    const input = inputOf('f');
    input?.focus();

    const mutations = [...run([row('n'), row('f'), row('m')]), ...run([row('f')]), ...run([row('p'), row('q'), row('f'), row('r')])];
    expect(order()).toEqual(['header', 'p', 'q', 'f', 'r', 'footer']);
    expect(placed(mutations, rootOf('f'))).toBe(false);
    expect(focused()).toBe(input);
  });
});
