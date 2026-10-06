/**
 * The dependency gate (NFR-S-01, AC-14.1.1, M11 AC-2; plan step 2).
 *
 * Each published package, as packed, has 0 direct and 0 transitive runtime
 * dependencies. Its `dependencies` name only other published `@fhirq`
 * packages, each pinned to exactly the version packed beside it, and every
 * package packs the same version (Changesets fixed mode, ADR-0008). It has no
 * optional and no bundled dependencies. Its only peers are `react` and
 * `react-dom`, and only on `@fhirq/react`: peers are the host's to install.
 *
 * It reads the `package.json` inside each tarball `scripts/pack.mjs` wrote, so
 * it judges what would be published, after pnpm rewrote each `workspace:`
 * range. A package reaches only what its manifest names and, through each kit
 * package it depends on, what that one's packed manifest names; so the walk
 * over the packed manifests is the whole installed tree, the one
 * `scripts/sbom.mjs`'s `layout()` lays out. The walk is its own here because
 * `layout()` stops at the first package outside the kit, and the gate names
 * every one.
 *
 *   pnpm build && node scripts/pack.mjs && node scripts/check-dependencies.mjs [dir]    exit 1 naming each offender, default reports/tarballs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { TARBALLS } from './pack.mjs';

const KIT = /^@fhirq\//;

/** The peers each package may declare, by package name; none for any other. */
export const PEERS = { '@fhirq/react': ['react', 'react-dom'] };

/** The `package.json` packed in each `.tgz` in `dir`, by tarball name. */
export function manifests(dir = TARBALLS) {
  const tarballs = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.tgz')).sort() : [];
  return tarballs.map((tarball) => JSON.parse(execFileSync('tar', ['-xzOf', join(dir, tarball), 'package/package.json'], { encoding: 'utf8' })));
}

/** What is wrong with one manifest's own fields, against the published versions in `published`. */
function direct(manifest, published) {
  const { name } = manifest;
  const found = [];
  for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
    if (!KIT.test(dependency)) found.push(`${name}: depends on ${dependency}@${range}, outside the kit`);
    else if (!published.has(dependency)) found.push(`${name}: depends on ${dependency}, which is not published`);
    else if (range !== published.get(dependency)) found.push(`${name}: pins ${dependency} to ${range}, not exactly ${published.get(dependency)}`);
  }
  for (const field of ['optionalDependencies', 'bundleDependencies', 'bundledDependencies']) {
    const entries = manifest[field] ?? [];
    const names = Array.isArray(entries) ? entries : Object.keys(entries);
    if (names.length > 0) found.push(`${name}: has ${field}, ${names.join(', ')}`);
  }
  const allowed = PEERS[name] ?? [];
  for (const peer of Object.keys(manifest.peerDependencies ?? {}).filter((entry) => !allowed.includes(entry))) {
    found.push(`${name}: has peer ${peer}, which ${allowed.length > 0 ? `is not ${allowed.join(' or ')}` : 'it may not have'}`);
  }
  return found;
}

/** Each package outside the kit `manifest` reaches through the kit packages it depends on, with the first one it is reached through. */
function transitive(manifest, byName) {
  const reached = new Map();
  const seen = new Set([manifest.name]);
  const pending = Object.keys(manifest.dependencies ?? {}).filter((dependency) => byName.has(dependency)).map((dependency) => ({ dependency, through: dependency }));
  while (pending.length > 0) {
    const { dependency, through } = pending.shift();
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    for (const next of Object.keys(byName.get(dependency).dependencies ?? {})) {
      if (byName.has(next)) pending.push({ dependency: next, through });
      else if (!KIT.test(next) && !reached.has(next)) reached.set(next, through);
    }
  }
  return reached;
}

/** Every problem across the packed `manifests`; empty when there is none. */
export function problems(packed) {
  if (packed.length === 0) return ['no tarballs; run node scripts/pack.mjs first'];
  const versions = [...new Set(packed.map(({ version }) => version))].sort();
  const found = versions.length > 1 ? [`packed versions differ: ${packed.map(({ name, version }) => `${name}@${version}`).join(', ')}`] : [];
  const byName = new Map(packed.map((manifest) => [manifest.name, manifest]));
  const published = new Map(packed.map(({ name, version }) => [name, version]));
  for (const manifest of packed) {
    found.push(...direct(manifest, published));
    for (const [dependency, through] of transitive(manifest, byName)) found.push(`${manifest.name}: reaches ${dependency} through ${through}, outside the kit`);
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] ?? TARBALLS);
  const packed = manifests(dir);
  const found = problems(packed);
  if (found.length > 0) {
    for (const problem of found) console.error(problem);
    process.exit(1);
  }
  console.log(`dependencies: ${packed.length} packages at ${packed[0].version}, 0 direct and 0 transitive outside the kit, peers react and react-dom on @fhirq/react only`);
}
