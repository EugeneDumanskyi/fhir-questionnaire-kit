import { describe, expect, it } from 'vitest';

import { ELEMENT_ENTRY_POINT } from '../src/index.js';

// M0 placeholder suite; M1 replaces it.
describe('@fhirq/element entry point', () => {
  it('exists', () => {
    expect(ELEMENT_ENTRY_POINT).toBe('@fhirq/element');
  });
});
