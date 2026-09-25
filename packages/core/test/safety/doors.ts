/**
 * The doors out of a page or process that AC-14.6.1, NFR-X-01 and NFR-X-02
 * name: network, storage and telemetry. `lock` replaces each with a stub that
 * records the touch and throws, so a test can run a package's whole
 * lifecycle and then read back that nothing tried one. Shared by every
 * package's no-network, no-storage test, in Node and in the browser.
 */
export const GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB'] as const;

export interface Doors {
  /** Every door touched, in order: a name from `GLOBALS`, `navigator.sendBeacon` or `document.cookie`. */
  readonly touched: string[];
  /** The stack at each touch, in the same order: where it came from, for a test that allows one caller. */
  readonly stacks: string[];
  /** Puts every door back as it was. */
  readonly unlock: () => void;
}

/**
 * Locks `GLOBALS` on `global`, `sendBeacon` on `navigator` and `cookie` on
 * `document`. Node has no `document` and a `navigator` without `sendBeacon`,
 * so a Node test passes plain objects and installs them itself; a browser
 * test passes the page's own, whose prototypes keep everything else working.
 */
export function lock(global: object, navigator: object, document: object): Doors {
  const touched: string[] = [];
  const stacks: string[] = [];
  const restore: (() => void)[] = [];
  const trap = (target: object, name: string, label = name) => {
    const before = Object.getOwnPropertyDescriptor(target, name);
    const refuse = (): never => {
      const error = new Error(`${label} is off limits to @fhirq/*`);
      touched.push(label);
      stacks.push(error.stack ?? '');
      throw error;
    };
    Object.defineProperty(target, name, { configurable: true, get: refuse, set: refuse });
    restore.push(() => {
      if (before === undefined) Reflect.deleteProperty(target, name);
      else Object.defineProperty(target, name, before);
    });
  };
  for (const name of GLOBALS) trap(global, name);
  trap(navigator, 'sendBeacon', 'navigator.sendBeacon');
  trap(document, 'cookie', 'document.cookie');
  return {
    touched,
    stacks,
    unlock: () => {
      for (const undo of restore.reverse()) undo();
    },
  };
}
