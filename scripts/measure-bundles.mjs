/**
 * Bundle measurement (NFR-S-02, NFR-S-03, ADR-0018): esbuild with a metafile,
 * gzip through node:zlib, one figure per published entry point, measured the
 * way NFR-S-02 defines each one.
 *
 *   node scripts/measure-bundles.mjs            report only (M1)
 *   node scripts/measure-bundles.mjs --check    exit 1 when a gated entry is over budget or bundles node_modules
 *
 * An entry is gated from the milestone that builds it (`budgets.json` `gated`,
 * `06-roadmap.md` §5): core from M2, the others from M5–M8. Every entry is
 * still measured and reported.
 *
 * Writes reports/bundle-sizes.json and reports/bundle-sizes.md.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { constants, gzipSync } from 'node:zlib';

import { build, transform } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Published specifier → workspace source. The published `dist/` is not built in M1. */
export const SOURCES = {
  '@fhirq/core': 'packages/core/src/index.ts',
  '@fhirq/core/view': 'packages/core/src/view/index.ts',
  '@fhirq/react': 'packages/react/src/index.ts',
  '@fhirq/element': 'packages/element/src/index.ts',
  '@fhirq/themes/base.css': 'packages/themes/src/base.css',
  '@fhirq/themes/default.css': 'packages/themes/src/default.css',
};

const REACT = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'];

/**
 * What each figure includes, exactly as NFR-S-02 words it. `external` is what
 * the entry is measured *without*.
 */
export const ENTRIES = [
  { name: '@fhirq/core', entry: '@fhirq/core', external: [] },
  { name: '@fhirq/core/view', entry: '@fhirq/core/view', external: ['@fhirq/core'] },
  { name: '@fhirq/react', entry: '@fhirq/react', external: [...REACT, '@fhirq/core', '@fhirq/core/view'] },
  {
    name: '@fhirq/element',
    // The S1 element takes a host-created session (decision D2), so its own
    // entry reaches no engine code. NFR-S-02 counts core in the element's
    // figure, and from M7 the element creates sessions itself, so the engine a
    // page needs is bundled in explicitly.
    stdin: "export * from '@fhirq/element';\nexport { createSession } from '@fhirq/core';\n",
    external: [],
    note: 'standalone: the element plus core (createSession), view and the embedded, minified theme',
  },
  {
    name: '@fhirq/element (IIFE)',
    stdin: "import { defineQuestionnaireElement } from '@fhirq/element';\nexport { createSession } from '@fhirq/core';\ndefineQuestionnaireElement();\n",
    format: 'iife',
    external: [],
    note: 'script-tag embed: the element, defined, plus createSession on window.fhirq',
  },
  { name: '@fhirq/themes/base.css', entry: '@fhirq/themes/base.css', external: [], css: true },
  { name: '@fhirq/themes/default.css', entry: '@fhirq/themes/default.css', external: [], css: true },
];

/**
 * Resolves `@fhirq/*` specifiers to workspace sources, the same mapping the
 * tests use, and keeps an entry's externals external (a plugin resolves before
 * esbuild's own `external` list is consulted). A stylesheet embedded as text is
 * minified first, as the element's build will embed it (ADR-0014).
 */
export function workspacePlugin(external = [], sources = SOURCES, base = root) {
  return {
    name: 'fhirq-workspace',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^@fhirq\// }, (args) => {
        if (external.includes(args.path)) return { path: args.path, external: true };
        const source = sources[args.path];
        if (source === undefined) return { errors: [{ text: `no workspace source for ${args.path}` }] };
        return { path: `${base}${source}` };
      });
      pluginBuild.onLoad({ filter: /\.css$/ }, async (args) => {
        if (pluginBuild.initialOptions.loader?.['.css'] !== 'text') return undefined;
        const { code } = await transform(await readFile(args.path, 'utf8'), { loader: 'css', minify: true });
        return { contents: code, loader: 'text' };
      });
    },
  };
}

/** Gzip at maximum compression: the figure a CDN serving the file would reach. */
export function gzipSize(bytes) {
  return gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION }).length;
}

/** Inputs that came from node_modules. Any is a runtime dependency (NFR-S-01, ADR-0008). */
export function nodeModulesInputs(metafile) {
  return Object.keys(metafile.inputs).filter((input) => input.includes('node_modules/'));
}

/** Per-module minified bytes, largest first: the input to M1 AC-1's extrapolation. */
export function modules(metafile) {
  const [output] = Object.values(metafile.outputs);
  return Object.entries(output?.inputs ?? {})
    .map(([path, { bytesInOutput }]) => ({ path: path.replace(/^.*?(packages\/)/, '$1'), bytes: bytesInOutput }))
    .filter((input) => input.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
}

/** The rows that fail the gate: gated entries over budget or bundling anything from node_modules. */
export function failures(rows, gated) {
  return rows.filter((row) => gated.includes(row.name) && (row.over || row.nodeModules.length > 0));
}

export function compare(results, budgets) {
  return results.map((result) => {
    const budget = budgets[result.name] ?? null;
    return { ...result, budget, over: budget !== null && result.gzip > budget };
  });
}

const kB = (bytes) => (bytes / 1000).toFixed(2);

export function renderMarkdown(rows, generated) {
  const lines = [
    `# Bundle sizes`,
    '',
    `Generated ${generated}. Minified with esbuild (ES2022), gzip level 9, 1 kB = 1,000 bytes.`,
    '',
    '| Entry point | Minified | Gzip | Budget | Headroom | node_modules inputs |',
    '|---|---:|---:|---:|---:|---|',
    ...rows.map((row) => {
      const budget = row.budget === null ? '—' : `${kB(row.budget)} kB`;
      const headroom = row.budget === null ? '—' : `${row.over ? '**over** ' : ''}${kB(row.budget - row.gzip)} kB`;
      const deps = row.nodeModules.length === 0 ? 'none' : `**${row.nodeModules.length}**`;
      return `| \`${row.name}\` | ${kB(row.minified)} kB | ${kB(row.gzip)} kB | ${budget} | ${headroom} | ${deps} |`;
    }),
    '',
  ];
  for (const row of rows.filter((r) => r.modules.length > 0)) {
    lines.push(`## \`${row.name}\` by module (minified bytes in output)`, '');
    if (row.note !== undefined) lines.push(`${row.note}.`, '');
    lines.push('| Module | Bytes |', '|---|---:|');
    for (const module of row.modules) lines.push(`| ${module.path} | ${module.bytes} |`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function measure(entry) {
  const result = await build({
    ...(entry.stdin === undefined
      ? { entryPoints: [entry.entry] }
      : { stdin: { contents: entry.stdin, resolveDir: root, loader: 'ts' } }),
    absWorkingDir: root,
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    outdir: 'out',
    target: 'es2022',
    format: entry.format ?? 'esm',
    globalName: entry.format === 'iife' ? 'fhirq' : undefined,
    platform: 'browser',
    external: entry.external,
    loader: { '.css': entry.css === true ? 'css' : 'text' },
    plugins: [workspacePlugin(entry.external)],
    legalComments: 'none',
    logLevel: 'silent',
  });
  const [file] = result.outputFiles;
  return {
    name: entry.name,
    note: entry.note,
    minified: file.contents.length,
    gzip: gzipSize(file.contents),
    nodeModules: nodeModulesInputs(result.metafile),
    modules: entry.css === true ? [] : modules(result.metafile),
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const { entries: budgets, gated } = JSON.parse(await readFile(new URL('./budgets.json', import.meta.url), 'utf8'));
  const results = [];
  for (const entry of ENTRIES) results.push(await measure(entry));
  const rows = compare(results, budgets);
  const generated = new Date().toISOString();

  mkdirSync(`${root}reports`, { recursive: true });
  writeFileSync(`${root}reports/bundle-sizes.json`, `${JSON.stringify({ generated, rows }, null, 2)}\n`);
  writeFileSync(`${root}reports/bundle-sizes.md`, renderMarkdown(rows, generated));

  for (const row of rows) {
    const gate = gated.includes(row.name) ? 'gated' : 'report only';
    console.log(`${row.over ? 'OVER' : 'ok  '} ${row.name.padEnd(28)} ${kB(row.gzip).padStart(6)} kB gzip  (budget ${row.budget === null ? '—' : kB(row.budget)} kB, ${gate})`);
  }
  if (check && failures(rows, gated).length > 0) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
