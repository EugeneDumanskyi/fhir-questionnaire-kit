// MUST FAIL: every marked line reads the DOM where it runs on import or during render.
// Linted only by the rule's own test; the repository lint run ignores this tree.
import { memo, useMemo, useState, useSyncExternalStore } from 'react';

const wide = window.innerWidth > 600; // 1: module scope

export function Form(): JSX.Element {
  const title = document.title; // 2: a component's body
  const [stored] = useState(() => localStorage.getItem('draft')); // 3: useState's initialiser
  const zone = useMemo(() => navigator.language, []); // 4: useMemo runs during render
  return <p>{title}{stored}{zone}{String(wide)}</p>;
}

export const Item = memo(function Item(): JSX.Element {
  return <p>{typeof window === 'undefined' ? 'server' : 'client'}</p>; // 5: branching on the client in a render
});

export const Row = memo(() => <p>{globalThis.location.href}</p>); // 6: an arrow component inside memo

export function useWidth(): number {
  return useSyncExternalStore(
    () => () => undefined,
    () => window.innerWidth, // 7: the client snapshot reader runs during render
    () => 0,
  );
}

export function focusFirst(): void {
  document.querySelector('input')?.focus(); // 8: not inside a component or hook, so nothing says when it runs
}
