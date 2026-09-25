/**
 * The element's build (NFR-C-05, M7 plan D9). `pnpm build` for the other
 * packages is M11; the element is built now because its script-tag embed is
 * what M7 ships and measures.
 *
 *   node scripts/build-element.mjs
 *
 * Writes three files to packages/element/dist, beside the declarations tsc
 * emits there:
 *
 * - `index.js`, ESM: the element, with `@fhirq/core` external and the theme
 *   minified and inlined as text (ADR-0014). `process.env.NODE_ENV` is left
 *   for the consumer's bundler, as React's entry leaves it.
 * - `define.js`, ESM: registers the element, importing it from `./index.js`.
 * - `fhirq-element.js`, IIFE: everything bundled from `src/iife.ts`, global
 *   `fhirq`, minified and built for production, since a page that loads it
 *   has no bundler to strip development-only code.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import { PRODUCTION, workspacePlugin } from './measure-bundles.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = 'packages/element/src';

/** The engine a consumer installs beside the element: both of `@fhirq/core`'s entries the element imports. */
export const CORE_EXTERNAL = ['@fhirq/core', '@fhirq/core/view'];

/** Keeps `define.js`'s import of the element external, so the class exists once. */
const indexExternal = {
  name: 'fhirq-element-index',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.\/index\.js$/ }, (args) => ({ path: args.path, external: true }));
  },
};

const common = {
  absWorkingDir: root,
  bundle: true,
  target: 'es2022',
  platform: 'browser',
  loader: { '.css': 'text' },
  legalComments: 'none',
  logLevel: 'silent',
  metafile: true,
};

/** The three outputs, as esbuild options. `outdir` is where they are written. */
export function elementBuilds(outdir) {
  return [
    {
      ...common,
      entryPoints: { index: `${src}/index.ts` },
      format: 'esm',
      outdir,
      external: CORE_EXTERNAL,
      plugins: [workspacePlugin(CORE_EXTERNAL)],
    },
    {
      ...common,
      entryPoints: { define: `${src}/define.ts` },
      format: 'esm',
      outdir,
      plugins: [indexExternal],
    },
    {
      ...common,
      entryPoints: { 'fhirq-element': `${src}/iife.ts` },
      format: 'iife',
      globalName: 'fhirq',
      minify: true,
      define: PRODUCTION,
      outdir,
      plugins: [workspacePlugin()],
    },
  ];
}

/** Builds every output; with `write: false` the files are returned, not written. */
export function buildElement({ outdir = 'packages/element/dist', write = true } = {}) {
  return Promise.all(elementBuilds(outdir).map((options) => build({ ...options, write })));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await buildElement();
  for (const { metafile } of results) for (const [file, { bytes }] of Object.entries(metafile.outputs)) console.log(`${file.padEnd(40)} ${bytes} bytes`);
}
