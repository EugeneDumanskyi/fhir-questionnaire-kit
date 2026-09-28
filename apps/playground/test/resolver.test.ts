import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { load } from '../src/load.js';
import { inMemory, valueSets } from '../src/resolver.js';

/** The in-memory resolver (M9 step 8, plan D9): the `option-resolution` fixture's value sets, answered from the page. */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const scenario = read('fixtures/option-resolution/scenario.json');
const optionResolution = read('fixtures/option-resolution/questionnaire.json');

const SUBSTANCE = 'urn:fhirq:conformance:ValueSet/substance';
const ROUTE = 'urn:fhirq:conformance:ValueSet/route';
const signal = new AbortController().signal;
/** A turn of the event loop: every settlement the resolver started has run. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('valueSets', () => {
  it("holds each set a case fulfils, with the fixture's codings", () => {
    const sets = valueSets(scenario);
    expect([...sets.keys()]).toEqual([SUBSTANCE, ROUTE]);
    expect(sets.get(SUBSTANCE)).toEqual([
      { system: 'urn:fhirq:conformance:codes', code: 'a', display: 'A' },
      { system: 'urn:fhirq:conformance:codes', code: 'b', display: 'B' },
    ]);
  });

  it('leaves out a set a case only rejects or leaves pending', () => {
    const sets = valueSets(JSON.stringify({ cases: [{ resolver: { 'urn:x': 'reject', 'urn:y': 'pending' } }, {}] }));
    expect(sets.size).toBe(0);
  });
});

describe('inMemory', () => {
  const resolver = inMemory(valueSets(scenario));

  it('answers a set it holds', async () => {
    await expect(resolver(ROUTE, { signal })).resolves.toHaveLength(2);
  });

  it('fails a canonical it does not hold, naming it', async () => {
    await expect(resolver('urn:elsewhere', { signal })).rejects.toThrow('No value set urn:elsewhere in this page');
  });

  it("resolves the option-resolution sample's sets in a loaded session, with no diagnostics", async () => {
    const loaded = load(optionResolution, 'strict', resolver);
    expect(loaded).toMatchObject({ kind: 'loaded', hostCode: false });
    if (loaded.kind !== 'loaded') return;
    await settled();
    expect(loaded.session.getSnapshot().optionSets).toMatchObject({ [SUBSTANCE]: { status: 'resolved' }, [ROUTE]: { status: 'resolved' } });
    expect(loaded.session.diagnostics).toEqual([]);
  });

  it('fails an unknown set in a loaded session, as a resolver-failed warning', async () => {
    const unknown = optionResolution.replace(ROUTE, 'urn:elsewhere');
    const loaded = load(unknown, 'strict', resolver);
    if (loaded.kind !== 'loaded') throw new Error(loaded.kind);
    await settled();
    expect(loaded.session.getSnapshot().optionSets).toMatchObject({ 'urn:elsewhere': { status: 'failed' } });
    expect(loaded.session.diagnostics).toMatchObject([{ code: 'resolver-failed', severity: 'warning', detail: 'urn:elsewhere' }]);
  });
});
