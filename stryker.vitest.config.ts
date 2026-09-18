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
    // The recompute-set check at the scale ceiling takes half the suite's time
    // and kills nothing the generated properties do not: they assert the same
    // BFS equality on small trees. Every static mutant reruns the whole suite,
    // so it stays in `pnpm test` and out of here (step 12, S2 K1).
    // M3's round-trip, restore and leak properties mostly exercise snapshot,
    // restore and hydration, which are not mutated. Full runs with and without
    // them detect the same mutants, once `rules.test.ts` covers a rule whose
    // own input is disabled. They stay in `pnpm test` (M3, S2 K1).
    exclude: ['test/property/ceiling.test.ts', 'test/property/roundtrip.test.ts', 'test/property/restore.test.ts', 'test/property/leak.test.ts'],
    // Each mutant reruns the generated properties; a few cases per property is enough to kill with.
    env: { FHIRQ_PROPERTY_RUNS: '12' },
  },
});
