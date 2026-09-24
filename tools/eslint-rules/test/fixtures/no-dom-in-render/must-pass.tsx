// MUST PASS: the DOM is read in effects, handlers and ref callbacks only.
import { useEffect, useRef, useSyncExternalStore, type FocusEvent } from 'react';

export function Form({ document }: { readonly document: string }): JSX.Element {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => form.current?.ownerDocument.getElementById('x')?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);
  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    if (!(event.relatedTarget instanceof Node)) window.scrollTo(0, 0);
  };
  return (
    <form ref={form} onBlur={onBlur} onSubmit={() => localStorage.clear()}>
      {document /* a prop named document is the component's own */}
    </form>
  );
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify);
      return () => window.removeEventListener('online', notify);
    },
    () => true,
    () => true,
  );
}

type Probe = typeof document;
export const probe: Probe | null = null;
