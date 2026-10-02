/**
 * A CycloneDX SBOM for each published package (M10 AC-6, plan D5 and step 8;
 * NFR-X-07 attaches them to releases from M11), made by
 * `@cyclonedx/cyclonedx-npm` (ADR-0018) over what npm would install, not
 * over the workspace.
 *
 * The tool reads the tree through `npm ls`, which does not understand pnpm's
 * workspace links. So each package is packed as it would be published, its
 * tarball unpacked into a scratch directory, and each `@fhirq` package it
 * depends on unpacked under its `node_modules`, exactly where npm would put
 * it. `npm ls` then sees a tree it accepts, and no error is ignored. A
 * dependency outside the kit cannot be laid out this way; it is refused,
 * since NFR-S-01 allows none. Each SBOM must then name no component outside
 * the kit.
 *
 * Peer dependencies are omitted: they are the host's (`docs/adoption.md`'s
 * inventory lists them). Output is reproducible: no timestamp, no serial.
 *
 * Run it as `pnpm build:sbom`: pnpm has a `pnpm sbom` command of its own,
 * which a script of that name cannot shadow.
 *
 *   pnpm build && node scripts/sbom.mjs [out]    writes out/<package>.cdx.json, default reports/sbom
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { workspace } from './inventory.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const KIT = /^@fhirq\//;

/** `@fhirq/core` → `fhirq-core`, the stem of its tarball and its SBOM file. */
export const stem = (name) => name.replace(/^@/, '').replace('/', '-');

/**
 * Where each published package's tree is laid out, by package name: a list of
 * `{ name, into }`, the package itself at `''` and each kit package it
 * reaches under `node_modules`, flat, as npm would hoist it. Throws on a
 * dependency outside the kit.
 */
export function layout(manifests) {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  const trees = new Map();
  for (const manifest of manifests.filter((entry) => entry.private !== true)) {
    const placed = [{ name: manifest.name, into: '' }];
    const pending = [manifest];
    while (pending.length > 0) {
      const current = pending.shift();
      for (const dependency of Object.keys(current.dependencies ?? {})) {
        if (!KIT.test(dependency) || !byName.has(dependency)) {
          throw new Error(`${current.name} depends on ${dependency}, outside the kit (NFR-S-01 allows none)`);
        }
        if (placed.some((entry) => entry.name === dependency)) continue;
        placed.push({ name: dependency, into: `node_modules/${dependency}` });
        pending.push(byName.get(dependency));
      }
    }
    trees.set(manifest.name, placed);
  }
  return trees;
}

/** What is wrong with `bom` as the SBOM of published package `name`; empty when nothing is. */
export function verify(bom, name) {
  const problems = [];
  if (bom.bomFormat !== 'CycloneDX') problems.push(`${name}: not a CycloneDX document`);
  const subject = [bom.metadata?.component?.group, bom.metadata?.component?.name].filter(Boolean).join('/');
  if (subject !== name) problems.push(`${name}: describes ${subject || 'nothing'}`);
  for (const component of bom.components ?? []) {
    const id = [component.group, component.name].filter(Boolean).join('/');
    if (!KIT.test(id)) problems.push(`${name}: names ${id}@${component.version}, outside the kit`);
  }
  return problems;
}

/**
 * The environment the tool runs in. Under `pnpm run`, `npm_execpath` names
 * pnpm, and the tool reads it to find npm; without it, npm is found on the
 * path.
 */
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'npm_execpath'));
const run = (command, args, cwd) => execFileSync(command, args, { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Packs, lays out and describes each published package, writing `<stem>.cdx.json` into `out`; returns each package's components. */
export function sbom(out, base = root) {
  const packages = workspace(base).filter(({ manifest }) => manifest.private !== true);
  for (const { dir, manifest } of packages) {
    if (!existsSync(join(base, dir, 'dist'))) throw new Error(`${manifest.name}: no dist; run pnpm build first`);
  }
  const scratch = mkdtempSync(join(tmpdir(), 'fhirq-sbom-'));
  try {
    const tarballs = new Map();
    for (const { dir, manifest } of packages) {
      tarballs.set(manifest.name, JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', scratch], join(base, dir))).filename);
    }
    mkdirSync(out, { recursive: true });
    const described = new Map();
    for (const [name, placed] of layout(packages.map(({ manifest }) => manifest))) {
      const tree = join(scratch, stem(name));
      for (const { name: part, into } of placed) {
        mkdirSync(join(tree, into), { recursive: true });
        run('tar', ['-xzf', tarballs.get(part), '-C', join(tree, into), '--strip-components', '1'], scratch);
      }
      mkdirSync(join(tree, 'node_modules'), { recursive: true });
      const file = join(scratch, `${stem(name)}.cdx.json`);
      const tool = join(base, 'node_modules', '.bin', 'cyclonedx-npm');
      run(tool, ['--omit', 'dev', '--omit', 'peer', '--mc-type', 'library', '--output-reproducible', '--output-format', 'JSON', '--output-file', file], tree);
      const bom = JSON.parse(readFileSync(file, 'utf8'));
      const problems = verify(bom, name);
      if (problems.length > 0) throw new Error(problems.join('\n'));
      copyFileSync(file, join(out, `${stem(name)}.cdx.json`));
      described.set(name, (bom.components ?? []).map((component) => `${component.group}/${component.name}@${component.version}`));
    }
    return described;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(process.argv[2] ?? join(root, 'reports', 'sbom'));
  for (const [name, components] of sbom(out)) {
    console.log(`${name}: ${components.length === 0 ? 'no components' : components.join(', ')}`);
  }
  console.log(`SBOMs written to ${out}`);
}
