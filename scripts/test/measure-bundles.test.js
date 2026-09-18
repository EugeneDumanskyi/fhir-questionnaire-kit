import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { compare, ENTRIES, failures, gzipSize, measure, modules, nodeModulesInputs, renderMarkdown, RESUME_ONLY, resumeInputs, SOURCES } from '../measure-bundles.mjs';

describe('measure-bundles', () => {
  it('gzips at maximum compression, never larger than the default level', () => {
    const bytes = Buffer.from('fhirq '.repeat(500));
    expect(gzipSize(bytes)).toBeLessThanOrEqual(gzipSync(bytes).length);
    expect(gzipSize(bytes)).toBeLessThan(bytes.length);
  });

  it('flags any input from node_modules as a runtime dependency (NFR-S-01)', () => {
    const metafile = { inputs: { 'packages/core/src/index.ts': {}, '../node_modules/.pnpm/x/node_modules/x/index.js': {} } };
    expect(nodeModulesInputs(metafile)).toEqual(['../node_modules/.pnpm/x/node_modules/x/index.js']);
  });

  it('lists modules by bytes in output, largest first, without empty ones', () => {
    const metafile = {
      outputs: {
        'out/stdin.js': {
          inputs: {
            '/repo/packages/core/src/a.ts': { bytesInOutput: 10 },
            '/repo/packages/core/src/types.ts': { bytesInOutput: 0 },
            '/repo/packages/core/src/b.ts': { bytesInOutput: 30 },
          },
        },
      },
    };
    expect(modules(metafile)).toEqual([
      { path: 'packages/core/src/b.ts', bytes: 30 },
      { path: 'packages/core/src/a.ts', bytes: 10 },
    ]);
  });

  it('fails only gated entries, on an overrun or a node_modules input (M2: core only)', () => {
    const row = (name, over, nodeModules = []) => ({ name, over, nodeModules });
    const rows = [row('@fhirq/core', true), row('@fhirq/react', true), row('@fhirq/element', false, ['node_modules/x/index.js'])];
    expect(failures(rows, ['@fhirq/core']).map((failing) => failing.name)).toEqual(['@fhirq/core']);
    expect(failures(rows, ['@fhirq/core', '@fhirq/element']).map((failing) => failing.name)).toEqual(['@fhirq/core', '@fhirq/element']);
    expect(failures([row('@fhirq/core', false)], ['@fhirq/core'])).toEqual([]);
  });

  it('fails any entry that reaches the resume path, gated or not (ADR-0021)', () => {
    const row = (name, resume) => ({ name, over: false, nodeModules: [], resume });
    expect(failures([row('@fhirq/element', ['packages/core/src/resume.ts']), row('@fhirq/core', [])], []).map((failing) => failing.name)).toEqual(['@fhirq/element']);
    expect(failures([{ name: '@fhirq/core/resume', over: false, nodeModules: [] }], [])).toEqual([]);
  });

  it('finds resume inputs in a metafile by repository path', () => {
    const metafile = { inputs: { '/repo/packages/core/src/session/snapshot.ts': {}, 'packages/core/src/session/session.ts': {}, 'packages/core/src/resume.ts': {} } };
    expect(resumeInputs(metafile)).toEqual(['packages/core/src/session/snapshot.ts', 'packages/core/src/resume.ts']);
    expect(RESUME_ONLY).toEqual(expect.arrayContaining(['packages/core/src/interchange/decode.ts', 'packages/core/src/interchange/hydrate.ts']));
  });

  it('catches a main entry point that imports restoreSession (the must-fail fixture)', async () => {
    const leaky = await measure({ name: 'leaky', entry: 'scripts/test/fixtures/bundle-inputs/leaky-core.ts', external: [], resumeFree: true });
    expect(leaky.resume).toEqual(expect.arrayContaining(RESUME_ONLY));
    expect(failures([leaky], [])).toHaveLength(1);
  });

  it('keeps core, view and the element free of the resume path, and measures resume without core', async () => {
    const byName = Object.fromEntries(ENTRIES.map((entry) => [entry.name, entry]));
    const core = await measure(byName['@fhirq/core']);
    expect(core.resume).toEqual([]);
    expect(ENTRIES.filter((entry) => entry.resumeFree === true).map((entry) => entry.name)).toEqual([
      '@fhirq/core',
      '@fhirq/core/view',
      '@fhirq/element',
      '@fhirq/element (IIFE)',
    ]);
    const resume = await measure(byName['@fhirq/core/resume'], new Set(core.inputs));
    expect(resume.modules.map((m) => m.path)).not.toContain('packages/core/src/session/session.ts');
    expect(resume.modules.map((m) => m.path)).toContain('packages/core/src/session/snapshot.ts');
  });

  it('gates @fhirq/core from M2 and @fhirq/core/resume from M3, and only entries that have a budget', () => {
    const { entries, gated } = JSON.parse(readFileSync(new URL('../budgets.json', import.meta.url), 'utf8'));
    expect(gated).toEqual(['@fhirq/core', '@fhirq/core/resume']);
    for (const name of gated) expect(entries[name]).toBeTypeOf('number');
  });

  it('compares against budgets and marks only a figure above its budget as over', () => {
    const rows = compare(
      [
        { name: 'a', gzip: 100 },
        { name: 'b', gzip: 101 },
        { name: 'c', gzip: 1 },
      ],
      { a: 100, b: 100 },
    );
    expect(rows.map((row) => [row.name, row.budget, row.over])).toEqual([
      ['a', 100, false],
      ['b', 100, true],
      ['c', null, false],
    ]);
  });

  it('renders a report a reader can check', () => {
    const md = renderMarkdown(
      [{ name: '@fhirq/core', minified: 3000, gzip: 1500, budget: 1000, over: true, nodeModules: ['x'], modules: [{ path: 'p.ts', bytes: 3000 }] }],
      '2026-09-16T00:00:00.000Z',
    );
    expect(md).toContain('| `@fhirq/core` | 3.00 kB | 1.50 kB | 1.00 kB | **over** -0.50 kB | **1** | — |');
    expect(md).toContain('| p.ts | 3000 |');
  });

  it('measures every budgeted entry point from its workspace source', () => {
    expect(ENTRIES.map((entry) => entry.name)).toEqual([
      '@fhirq/core',
      '@fhirq/core/view',
      '@fhirq/core/resume',
      '@fhirq/react',
      '@fhirq/element',
      '@fhirq/element (IIFE)',
      '@fhirq/themes/base.css',
      '@fhirq/themes/default.css',
    ]);
    expect(Object.keys(SOURCES)).toContain('@fhirq/themes/base.css');
  });

  it('keeps externals out of a measured bundle and counts core in the element', async () => {
    const byName = Object.fromEntries(ENTRIES.map((entry) => [entry.name, entry]));
    const react = await measure(byName['@fhirq/react']);
    const element = await measure(byName['@fhirq/element']);
    expect(react.modules.map((m) => m.path).every((path) => path.startsWith('packages/react/'))).toBe(true);
    expect(element.modules.map((m) => m.path)).toEqual(
      expect.arrayContaining(['packages/core/src/session/session.ts', 'packages/core/src/view/view.ts', 'packages/themes/src/base.css']),
    );
    expect(element.nodeModules).toEqual([]);
  });
});
