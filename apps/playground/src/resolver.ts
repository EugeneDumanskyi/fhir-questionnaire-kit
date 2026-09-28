import type { OptionResolver } from '@fhirq/core';

type Options = Awaited<ReturnType<OptionResolver>>;

/**
 * The value sets a scenario's in-memory resolver fulfils, by canonical, read
 * from its text (`fixtures/<name>/scenario.json`, shape in `fixtures/README.md`).
 * A set a case rejects or leaves pending has no options to give, so it is left out.
 */
export function valueSets(scenario: string): ReadonlyMap<string, Options> {
  const { cases } = JSON.parse(scenario) as { readonly cases: readonly { readonly resolver?: Readonly<Record<string, unknown>> }[] };
  const sets = new Map<string, Options>();
  for (const { resolver = {} } of cases) {
    for (const [canonical, entry] of Object.entries(resolver)) {
      if (typeof entry === 'object' && entry !== null && 'resolve' in entry && !sets.has(canonical)) sets.set(canonical, entry.resolve as Options);
    }
  }
  return sets;
}

/**
 * A resolver over value sets held in the page (M9 plan D9): it answers from
 * memory and asks the network nothing (ADR-0019). A canonical it does not hold
 * fails, so the form shows the kit's retry control, and a retry fails again.
 */
export function inMemory(sets: ReadonlyMap<string, Options>): OptionResolver {
  return (valueSet) => {
    const options = sets.get(valueSet);
    return options === undefined ? Promise.reject(new Error(`No value set ${valueSet} in this page`)) : Promise.resolve(options);
  };
}
