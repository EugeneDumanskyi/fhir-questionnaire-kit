import { describe, expect, it } from 'vitest';

import { buildElement, CORE_EXTERNAL } from '../build-element.mjs';
import { ENTRIES, gzipSize, measure, nodeModulesInputs } from '../measure-bundles.mjs';

/**
 * The element's build (NFR-C-05, M7 plan D9), in memory: ESM with the engine
 * external and the theme inlined, `define.js` over it, and the IIFE that the
 * byte gate measures.
 */
describe('build-element', () => {
  const built = buildElement({ outdir: 'out', write: false });
  const files = async () => Object.fromEntries((await built).flatMap((result) => result.outputFiles).map((file) => [file.path.replace(/^.*\/out\//, ''), file]));
  const imports = async (name) => (await built).flatMap((result) => Object.entries(result.metafile.outputs)).find(([path]) => path === `out/${name}`)?.[1].imports ?? [];

  it('writes the two ESM entries and the IIFE', async () => {
    expect(Object.keys(await files()).sort()).toEqual(['define.js', 'fhirq-element.js', 'index.js']);
  });

  it('leaves the engine to the consumer in the ESM entry, and inlines the theme as minified text', async () => {
    const index = (await files())['index.js'].text;
    const external = await imports('index.js');
    expect(external.length).toBeGreaterThan(0);
    expect(external.every((entry) => entry.external && CORE_EXTERNAL.includes(entry.path))).toBe(true);
    expect(index).not.toContain('packages/core/src');
    expect(index).toMatch(/":host\{display:block\}/);
  });

  it('defines the element from index.js, so a page that loads both has one class', async () => {
    expect(await imports('define.js')).toEqual([{ path: './index.js', kind: 'import-statement', external: true }]);
    expect((await files())['define.js'].text).toContain('defineQuestionnaireElement()');
  });

  it('bundles everything into the IIFE, for production, with nothing from node_modules', async () => {
    const [, , iife] = await built;
    const text = (await files())['fhirq-element.js'].text;
    expect(await imports('fhirq-element.js')).toEqual([]);
    expect(nodeModulesInputs(iife.metafile)).toEqual([]);
    expect(text).toMatch(/^"use strict";var fhirq=\(\(\)=>\{/);
    expect(text).not.toContain('process.env');
    expect(Object.keys(iife.metafile.inputs)).toEqual(expect.arrayContaining(['packages/core/src/session/session.ts', 'packages/element/src/iife.ts']));
  });

  it('leaves the tier-3 development check to the consumer build of the ESM entry, and out of the IIFE (ADR-0013)', async () => {
    const all = await files();
    expect(all['index.js'].text).toContain('control-contract');
    expect(all['fhirq-element.js'].text).not.toContain('control-contract');
    expect(all['fhirq-element.js'].text).not.toContain('console.warn');
  });

  it('is the file the IIFE budget measures', async () => {
    const measured = await measure(ENTRIES.find((entry) => entry.name === '@fhirq/element (IIFE)'));
    expect(gzipSize((await files())['fhirq-element.js'].contents)).toBe(measured.gzip);
  });
});
