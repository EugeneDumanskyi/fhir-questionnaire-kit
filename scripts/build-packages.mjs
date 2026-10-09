/**
 * The package build (ADR-0018, 2026-09-28 note; M9 plan D1).
 *
 *   node scripts/build-packages.mjs    build, then exit 1 naming any `exports` target that does not exist
 *
 * `pnpm build` runs `tsc --build` first, for the declarations, then this.
 * It writes, beside the declarations in each package's `dist`:
 *
 * - core, react and themes: one ESM `.js` and one CJS `.cjs` file per source
 *   module that a published entry point reaches, laid out as tsc lays out the
 *   `.d.ts` files. Not one bundle per entry: core's entries share modules
 *   (`resume` imports `open` and `FhirqError`), and a bundle each would give a
 *   consumer two copies of a class and an `instanceof` that fails across them.
 *   Every import stays an import; a relative one is rewritten to `.cjs` in the
 *   CJS files. `process.env.NODE_ENV` is left for the consumer's bundler.
 * - core, react and themes: a `.d.cts` beside each `.d.ts`, with its relative
 *   imports rewritten to `.cjs` in the same way, which `exports` names under
 *   `require`. Under `"type": "module"` a `.d.ts` types an ES module, so
 *   without these a CommonJS consumer under `node16` resolution is told it
 *   cannot `require` the package (TS1479; M11 plan step 5).
 * - themes: `base.css` and `default.css`, copied as authored.
 * - the element: `scripts/build-element.mjs`, unchanged (ESM only, M7 D9).
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import { buildElement } from './build-element.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The packages this script builds: the directory, and the stylesheets copied into `dist` as they are. */
export const PACKAGES = [
  { dir: 'packages/core', css: [] },
  { dir: 'packages/react', css: [] },
  { dir: 'packages/themes', css: ['base.css', 'default.css'] },
];

/** The element's `dist`, which `scripts/build-element.mjs` writes. */
const ELEMENT = 'packages/element';

const readManifest = (dir, base = root) => JSON.parse(readFileSync(join(base, dir, 'package.json'), 'utf8'));

/** Every file a manifest names: each `exports` target under every condition, plus `main`, `module` and `types`. */
export function manifestTargets(manifest) {
  const targets = new Set();
  const walk = (value) => {
    if (typeof value === 'string') targets.add(value.replace(/^\.\//, ''));
    else if (value !== null && typeof value === 'object') for (const nested of Object.values(value)) walk(nested);
  };
  walk(manifest.exports);
  for (const field of ['main', 'module', 'types']) walk(manifest[field]);
  targets.delete('package.json');
  return [...targets].sort();
}

/** The source behind a JavaScript target: `dist/view/index.js` → `src/view/index.ts` (or `.tsx`). */
function sourceOf(dir, target, base) {
  const stem = target.replace(/^dist\//, 'src/').replace(/\.(c?js)$/, '');
  return ['.ts', '.tsx'].map((extension) => `${dir}/${stem}${extension}`).find((path) => existsSync(join(base, path)));
}

/** Leaves every import an import. In CJS, a relative `./x.js` becomes `./x.cjs`, the file this build writes beside it. */
function externalImports(format) {
  return {
    name: 'fhirq-external-imports',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        if (!args.path.startsWith('.')) return { path: args.path, external: true };
        if (!args.path.endsWith('.js')) return { errors: [{ text: `relative import without a .js extension: ${args.path}` }] };
        return { path: format === 'cjs' ? args.path.replace(/\.js$/, '.cjs') : args.path, external: true };
      });
    },
  };
}

/**
 * The source modules a package's entry points reach, found by bundling each
 * entry with other packages external. These are the modules published.
 */
async function reachableModules(dir, entries, base) {
  const result = await build({
    absWorkingDir: base,
    entryPoints: entries,
    bundle: true,
    write: false,
    outdir: 'out',
    format: 'esm',
    platform: 'neutral',
    packages: 'external',
    metafile: true,
    logLevel: 'silent',
  });
  return Object.keys(result.metafile.inputs)
    .filter((input) => input.startsWith(`${dir}/src/`))
    .sort();
}

/**
 * One package's build, as esbuild options per format, from the JavaScript
 * targets its manifest names. Throws naming a target with no source.
 */
export async function packageBuilds(dir, { outdir = `${dir}/dist`, base = root } = {}) {
  const targets = manifestTargets(readManifest(dir, base)).filter((target) => /\.c?js$/.test(target));
  const entries = [...new Set(targets.map((target) => sourceOf(dir, target, base) ?? `${dir}/${target}`))];
  const missing = entries.filter((entry) => !entry.startsWith(`${dir}/src/`));
  if (missing.length > 0) throw new Error(`${dir}: no source for ${missing.join(', ')}`);
  const modules = await reachableModules(dir, entries, base);
  const formats = new Set(targets.map((target) => (target.endsWith('.cjs') ? 'cjs' : 'esm')));
  return ['esm', 'cjs'].filter((format) => formats.has(format)).map((format) => ({
    absWorkingDir: base,
    entryPoints: modules,
    outbase: `${dir}/src`,
    outdir,
    outExtension: { '.js': format === 'cjs' ? '.cjs' : '.js' },
    bundle: true,
    format,
    target: 'es2022',
    platform: 'neutral',
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
    plugins: [externalImports(format)],
  }));
}

/** A relative specifier ending `.js`, after `from`, `import` or `import(`. */
const RELATIVE = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\.js\2/g;

/** A `.d.ts` file's text as the `.d.cts` beside it: relative imports name the `.cjs` files, and the map comment, whose map is not published, is dropped. */
export const ctsDeclaration = (text) => text.replace(RELATIVE, '$1$2$3.cjs$2').replace(/^\/\/# sourceMappingURL=.*\n?/m, '');

/** Every `.d.ts` under `dir`, as paths relative to the repository root. */
function declarations(dir, base) {
  if (!existsSync(join(base, dir))) return [];
  return readdirSync(join(base, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.d.ts'))
    .map((entry) => join(entry.parentPath, entry.name).slice(join(base).length).replace(/^\//, ''))
    .sort();
}

/** Builds every package; with `write: false` the files are returned, not written, and no stylesheet is copied. */
export async function buildPackages({ write = true, base = root } = {}) {
  const outputs = [];
  for (const { dir, css } of PACKAGES) {
    const builds = await packageBuilds(dir, { base });
    for (const options of builds) {
      const result = await build({ ...options, write });
      outputs.push(...Object.keys(result.metafile.outputs));
    }
    if (builds.some(({ format }) => format === 'cjs')) {
      for (const path of declarations(`${dir}/dist`, base)) {
        const cts = path.replace(/\.d\.ts$/, '.d.cts');
        if (write) writeFileSync(join(base, cts), ctsDeclaration(readFileSync(join(base, path), 'utf8')));
        outputs.push(cts);
      }
    }
    for (const file of css) {
      if (write) {
        mkdirSync(join(base, dir, 'dist'), { recursive: true });
        copyFileSync(join(base, dir, 'src', file), join(base, dir, 'dist', file));
      }
      outputs.push(`${dir}/dist/${file}`);
    }
  }
  for (const result of await buildElement({ outdir: `${ELEMENT}/dist`, write })) outputs.push(...Object.keys(result.metafile.outputs));
  return outputs.sort();
}

/**
 * The `exports`, `main`, `module` and `types` targets that do not exist, as
 * repository paths. `exists` says whether a built file is there: the disk by
 * default, or a build's list of outputs.
 */
export function missingTargets(dirs, exists = (path) => existsSync(join(root, path)), base = root) {
  return dirs.flatMap((dir) => manifestTargets(readManifest(dir, base)).map((target) => `${dir}/${target}`)).filter((path) => !exists(path));
}

/** Every published package, the element included. */
export const PUBLISHED = [...PACKAGES.map(({ dir }) => dir), ELEMENT];

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputs = await buildPackages();
  const counts = Object.groupBy(outputs, (path) => path.split('/').slice(0, 2).join('/'));
  for (const [dir, files] of Object.entries(counts)) console.log(`${dir.padEnd(20)} ${files.length} files`);
  const missing = missingTargets(PUBLISHED);
  if (missing.length > 0) {
    console.error(`Named in a package.json but not built:\n${missing.map((path) => `  ${path}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Every exports target exists (${PUBLISHED.length} packages).`);
}
