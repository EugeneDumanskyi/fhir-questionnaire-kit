import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import { buildPackages, manifestTargets, missingTargets, packageBuilds, PUBLISHED } from '../build-packages.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/package-build/', import.meta.url));

/**
 * The package build (ADR-0018, 2026-09-28 note; M9 plan D1), in memory: one
 * ESM and one CJS file per module an entry point reaches, and every file a
 * manifest names accounted for.
 */
describe('build-packages', () => {
  const built = buildPackages({ write: false });

  /** What a build plus `tsc` leaves: this build's outputs, and a declaration for every source module. */
  const wouldExist = (outputs) => (path) =>
    outputs.includes(path) ||
    (path.endsWith('.d.ts') && ['.ts', '.tsx'].some((extension) => existsSync(`${root}${path.replace('/dist/', '/src/').replace(/\.d\.ts$/, extension)}`)));

  it('builds every target the published manifests name: exports, main, module and types', async () => {
    expect(missingTargets(PUBLISHED, wouldExist(await built))).toEqual([]);
  });

  it('reads targets under every condition, and not the manifest itself', () => {
    const manifest = {
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.cjs' }, './a.css': './dist/a.css', './package.json': './package.json' },
      main: './dist/index.cjs',
    };
    expect(manifestTargets(manifest)).toEqual(['dist/a.css', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.js']);
  });

  it('writes each module once per format, beside its declaration, so entries share one copy', async () => {
    const outputs = await built;
    for (const path of ['packages/core/dist/kernel/error.js', 'packages/core/dist/kernel/error.cjs', 'packages/core/dist/view/index.js', 'packages/react/dist/questionnaire.cjs', 'packages/themes/dist/index.cjs']) {
      expect(outputs).toContain(path);
    }
    const [esm] = await packageBuilds('packages/core');
    const result = await build({ ...esm, write: false });
    for (const output of Object.values(result.metafile.outputs)) expect(Object.keys(output.inputs).length).toBeLessThanOrEqual(1);
  });

  it('keeps imports as imports: packages external, relative ones pointing at the same format', async () => {
    const [esm, cjs] = await Promise.all((await packageBuilds('packages/core')).map((options) => build({ ...options, write: false })));
    const text = (result, name) => result.outputFiles.find((file) => file.path.endsWith(`/core/dist/${name}`)).text;
    expect(text(esm, 'resume.js')).toContain('from "./open.js"');
    expect(text(cjs, 'resume.cjs')).toContain('require("./open.cjs")');
    expect(text(cjs, 'resume.cjs')).not.toContain('.js"');
    const [, react] = await Promise.all((await packageBuilds('packages/react')).map((options) => build({ ...options, write: false })));
    const hook = react.outputFiles.find((file) => file.path.endsWith('/react/dist/hook.cjs')).text;
    expect(hook).toContain('require("@fhirq/core")');
    expect(hook).toContain('require("react")');
  });

  it('copies the stylesheets and leaves the element to its own build', async () => {
    expect(await built).toEqual(
      expect.arrayContaining(['packages/themes/dist/base.css', 'packages/themes/dist/default.css', 'packages/element/dist/index.js', 'packages/element/dist/fhirq-element.js']),
    );
    expect((await built).filter((path) => path.startsWith('packages/element/') && path.endsWith('.cjs'))).toEqual([]);
  });

  it('publishes no module an entry point does not reach', async () => {
    const outputs = await built;
    expect(outputs.filter((path) => path.includes('/test/') || path.includes('/bench/'))).toEqual([]);
  });

  describe('must fail', () => {
    it('refuses a manifest naming a JavaScript target with no source', async () => {
      await expect(packageBuilds('packages/unbuilt', { base: fixtures })).rejects.toThrow('packages/unbuilt: no source for packages/unbuilt/dist/extra.js');
    });

    it('names every target missing on disk', () => {
      expect(missingTargets(['packages/unbuilt'], () => false, fixtures)).toEqual([
        'packages/unbuilt/dist/extra.js',
        'packages/unbuilt/dist/index.cjs',
        'packages/unbuilt/dist/index.d.ts',
        'packages/unbuilt/dist/index.js',
        'packages/unbuilt/dist/theme.css',
      ]);
    });

    it('refuses a relative import without its .js extension, which no published file would resolve', async () => {
      const [esm] = await packageBuilds('packages/extensionless', { base: fixtures, outdir: 'out' });
      await expect(build({ ...esm, write: false, logLevel: 'silent' })).rejects.toThrow('relative import without a .js extension: ./helper');
    });
  });
});
