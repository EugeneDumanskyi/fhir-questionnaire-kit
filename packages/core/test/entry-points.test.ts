import { describe, expect, it } from 'vitest';

import { CORE_ENTRY_POINT } from '../src/index.js';
import { VIEW_ENTRY_POINT } from '../src/view/index.js';

// M0 placeholder suite. It asserts the one thing that is true at M0 — that both
// entry points exist and are separate — so `pnpm test` exercises the runner
// rather than reporting success over nothing. M1 replaces it.
describe('@fhirq/core entry points', () => {
  it('exposes the engine entry point', () => {
    expect(CORE_ENTRY_POINT).toBe('@fhirq/core');
  });

  it('exposes the presentation model as a separate entry point (ADR-0007)', () => {
    expect(VIEW_ENTRY_POINT).toBe('@fhirq/core/view');
    expect(VIEW_ENTRY_POINT).not.toBe(CORE_ENTRY_POINT);
  });

  it('runs in Node with no DOM (NFR-C-04)', () => {
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);
  });
});
