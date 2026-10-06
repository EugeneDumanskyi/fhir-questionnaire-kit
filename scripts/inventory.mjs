/**
 * The adoption pack's dependency inventory (M10 AC-6, plan step 8): what each
 * published package depends on, and every development dependency with its
 * licence, generated from the workspace's manifests and what is installed.
 * `docs/adoption.md` carries it between `<!-- inventory:start -->` and
 * `<!-- inventory:end -->`, and the lint fails when the two differ.
 *
 * A published package is one not marked `private`. Everything the root or a
 * private package declares is development-only, since none of it ships. The
 * kit's own `@fhirq/*` packages are not dependencies of the kit. A licence is
 * read from the installed package's `license` field, as NFR-S-07 reads it.
 * The column it is shown against is NFR-S-07's allowlist; the licence gate,
 * `scripts/check-licences.mjs`, enforces it over the same entries.
 *
 *   node scripts/inventory.mjs --write    rewrite the section in docs/adoption.md
 *   node scripts/inventory.mjs --check    exit 1 when the section is out of date
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const START = '<!-- inventory:start -->';
export const END = '<!-- inventory:end -->';
const PACK = 'docs/adoption.md';

/** NFR-S-07: licences any development dependency may carry. */
export const ALLOWED = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD'];
/** NFR-S-07: licences a development-only tool may carry, never anything published. */
export const DEV_ONLY = ['MPL-2.0'];

const KIT = /^@fhirq\//;
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The workspace's package directories, the root first, from `pnpm-workspace.yaml`'s `packages` globs (`dir` or `dir/*`). */
export function workspace(base = root) {
  const yaml = readFileSync(join(base, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [...(/^packages:\n((?: {2}- .+\n)+)/m.exec(yaml)?.[1] ?? '').matchAll(/- (.+)/g)].map((match) => match[1].trim().replace(/^['"]|['"]$/g, ''));
  const dirs = globs.flatMap((glob) =>
    glob.endsWith('/*')
      ? (existsSync(join(base, glob.slice(0, -2))) ? readdirSync(join(base, glob.slice(0, -2))).sort() : []).map((name) => `${glob.slice(0, -2)}/${name}`)
      : [glob],
  );
  return ['.', ...dirs].filter((dir) => existsSync(join(base, dir, 'package.json'))).map((dir) => ({ dir, manifest: json(join(base, dir, 'package.json')) }));
}

/** A manifest's licence, as its `license` field gives it, or its older `licenses` list. */
export function licence(manifest) {
  if (typeof manifest.license === 'string') return manifest.license;
  if (typeof manifest.license?.type === 'string') return manifest.license.type;
  if (Array.isArray(manifest.licenses)) return manifest.licenses.map((entry) => entry.type ?? entry).join(' OR ');
  return 'not declared';
}

/** Where `licence` stands against NFR-S-07's allowlist. */
export function allowed(id) {
  if (ALLOWED.includes(id)) return 'yes';
  if (DEV_ONLY.includes(id)) return 'dev-only tools';
  return '**no**';
}

/**
 * The third-party packages `pnpm-lock.yaml` resolves for the workspace,
 * counted from the `packages` section of its last document; the first, when
 * there are two, pins pnpm itself.
 */
function locked(base) {
  const lock = readFileSync(join(base, 'pnpm-lock.yaml'), 'utf8').split(/^---$/m).at(-1) ?? '';
  const section = /^packages:\n([\s\S]*?)(?=^\S|(?![\s\S]))/m.exec(lock)?.[1] ?? '';
  return [...section.matchAll(/^ {2}(\S.*):$/gm)].filter((match) => !KIT.test(match[1].replace(/^'/, ''))).length;
}

/** A published package's runtime dependencies outside the kit: those it names, and those its kit dependencies bring, by name. */
function runtime(name, manifests) {
  const direct = Object.keys(manifests.get(name)?.dependencies ?? {}).filter((dependency) => !KIT.test(dependency));
  const brought = new Set();
  const seen = new Set([name]);
  const visit = (kit) => {
    for (const dependency of Object.keys(manifests.get(kit)?.dependencies ?? {})) {
      if (!KIT.test(dependency)) brought.add(dependency);
      else if (!seen.has(dependency)) {
        seen.add(dependency);
        visit(dependency);
      }
    }
  };
  for (const kit of Object.keys(manifests.get(name)?.dependencies ?? {}).filter((dependency) => KIT.test(dependency))) {
    seen.add(kit);
    visit(kit);
  }
  return { direct, transitive: [...brought].filter((dependency) => !direct.includes(dependency)) };
}

/**
 * The inventory of the workspace at `base`: each published package with its
 * runtime dependencies, kit dependencies and peers; each development
 * dependency, by name and version, with its licence and the packages that
 * declare it; and the lockfile's count of third-party packages.
 */
export function inventory(base = root) {
  const packages = workspace(base);
  const manifests = new Map(packages.map(({ manifest }) => [manifest.name, manifest]));
  const published = packages
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ manifest }) => ({
      name: manifest.name,
      licence: licence(manifest),
      ...runtime(manifest.name, manifests),
      kit: Object.keys(manifest.dependencies ?? {}).filter((dependency) => KIT.test(dependency)),
      peers: Object.entries(manifest.peerDependencies ?? {}).map(([name, range]) => `${name} ${range}`),
    }));
  const development = new Map();
  for (const { dir, manifest } of packages) {
    const declared = { ...(manifest.private === true ? manifest.dependencies : {}), ...manifest.devDependencies };
    for (const [name, version] of Object.entries(declared)) {
      if (KIT.test(name)) continue;
      const key = `${name}@${version}`;
      const installed = join(base, dir, 'node_modules', name, 'package.json');
      const entry = development.get(key) ?? { name, version, licence: existsSync(installed) ? licence(json(installed)) : 'not installed', by: [] };
      entry.by.push(manifest.name === 'fhir-questionnaire-kit' ? 'the root' : manifest.name);
      development.set(key, entry);
    }
  }
  const order = (a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name));
  return { published, development: [...development.values()].sort(order), locked: locked(base) };
}

const list = (items) => (items.length === 0 ? 'none' : items.map((item) => `\`${item}\``).join(', '));

/** The section as `docs/adoption.md` carries it, between and including its markers. */
export function section({ published, development, locked: count }) {
  const licences = new Map();
  for (const { licence: id } of development) licences.set(id, (licences.get(id) ?? 0) + 1);
  const shipped = published.some((entry) => entry.direct.length + entry.transitive.length > 0);
  const tally = [...licences].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([id, n]) => `${id} ${n}`).join(', ');
  return [
    START,
    '',
    '**Published packages.** Runtime dependencies are counted outside the kit: a dependency on another `@fhirq` package is exact-pinned and ships in the same release. Peers are the host\'s to install.',
    '',
    '| Package | Licence | Runtime dependencies | Transitive | Depends on | Peers |',
    '|---|---|---|---|---|---|',
    ...published.map((entry) => `| \`${entry.name}\` | ${entry.licence} | ${entry.direct.length} | ${entry.transitive.length} | ${list(entry.kit)} | ${list(entry.peers)} |`),
    '',
    `**Development dependencies.** ${development.length} entries, by name and version: ${tally}. None of them ships in a published package. \`pnpm-lock.yaml\` resolves ${count.toLocaleString('en-US')} third-party packages${shipped ? '' : ', every one of them through these'}.`,
    '',
    '| Package | Version | Licence | NFR-S-07 | Declared by |',
    '|---|---|---|---|---|',
    ...development.map((entry) => `| \`${entry.name}\` | ${entry.version} | ${entry.licence} | ${allowed(entry.licence)} | ${entry.by.map((name) => (name === 'the root' ? name : `\`${name}\``)).join(', ')} |`),
    '',
    END,
  ].join('\n');
}

/** What is wrong with the section in `markdown` against `expected`; empty when it is in step. */
export function check(markdown, expected) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end < start) return [`no section between ${START} and ${END}`];
  return markdown.slice(start, end + END.length) === expected ? [] : ['the dependency inventory is out of date: run `pnpm inventory`'];
}

/** `markdown` with its section replaced by `expected`. */
export function write(markdown, expected) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end < start) throw new Error(`no section between ${START} and ${END}`);
  return markdown.slice(0, start) + expected + markdown.slice(end + END.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = join(root, PACK);
  const markdown = readFileSync(path, 'utf8');
  const expected = section(inventory());
  if (process.argv.includes('--write')) {
    writeFileSync(path, write(markdown, expected));
    console.log(`${PACK}: dependency inventory written`);
  } else {
    const problems = check(markdown, expected);
    for (const problem of problems) console.error(`${PACK}: ${problem}`);
    if (problems.length > 0) process.exit(1);
    console.log(`${PACK}: dependency inventory in step`);
  }
}
