import { defineConfig } from 'vitest/config';

/**
 * The suite StrykerJS runs each mutant against: `@fhirq/core` only, in Node
 * with no DOM shim, exactly as the `core` project of `vitest.config.ts`. The
 * Stryker Vitest runner has no project filter, and running the React, element
 * and tooling projects against an engine mutant would cost minutes and kill
 * nothing (NFR-Q-03, spike S2).
 */
export default defineConfig({
  test: {
    name: 'core',
    root: './packages/core',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
