import { describe, expect, it } from 'vitest';

import { THEMES_ENTRY_POINT } from '../src/index.js';

// M0 placeholder suite; M1 replaces it.
describe('@fhirq/themes entry point', () => {
  it('exists', () => {
    expect(THEMES_ENTRY_POINT).toBe('@fhirq/themes');
  });
});
