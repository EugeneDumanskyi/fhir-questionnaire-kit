import { describe, expect, it } from 'vitest';

import { REACT_ENTRY_POINT } from '../src/index.js';

// M0 placeholder suite; M1 replaces it.
describe('@fhirq/react entry point', () => {
  it('exists', () => {
    expect(REACT_ENTRY_POINT).toBe('@fhirq/react');
  });
});
