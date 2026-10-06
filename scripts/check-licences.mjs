/**
 * The licence gate (NFR-S-07, M11 AC-4; plan step 3).
 *
 * Each direct development dependency of the workspace, read from its
 * installed `license` field as NFR-S-07 reads it, carries a licence on the
 * allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or 0BSD, or
 * MPL-2.0 for a tool that is never bundled or redistributed. A runtime
 * dependency of a published package outside the kit, which the dependency gate
 * already fails, may not carry MPL-2.0 either: nothing published carries it
 * (NFR-S-07 with NFR-S-08). A package that declares no licence, or is not
 * installed, fails too, since its licence cannot be read. Peers are the host's
 * to install and are not gated; transitive development packages are not
 * either (ADR-0018).
 *
 * What is development-only, and how a licence is read, are the inventory's
 * (`scripts/inventory.mjs`): the table in `docs/adoption.md` and this gate
 * judge the same entries.
 *
 * An SPDX expression fits when one of its `OR` alternatives does, and an
 * alternative fits when each of its `AND` terms is on the list.
 *
 *   node scripts/check-licences.mjs    exit 1 naming each package and its licence
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLOWED, DEV_ONLY, inventory, licence, workspace } from './inventory.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const KIT = /^@fhirq\//;

/** Whether the licence or SPDX expression `id` fits the licences in `list`. */
export function fits(id, list) {
  return id
    .replace(/^\((.*)\)$/, '$1')
    .split(/\s+OR\s+/)
    .some((alternative) => alternative.replace(/^\((.*)\)$/, '$1').split(/\s+AND\s+/).every((term) => list.includes(term.trim())));
}

/** The licence of `name` as installed for the package in `dir`, or at the root; `not installed` when neither has it. */
function installed(base, dir, name) {
  const path = [join(base, dir, 'node_modules', name, 'package.json'), join(base, 'node_modules', name, 'package.json')].find((candidate) => existsSync(candidate));
  return path === undefined ? 'not installed' : licence(JSON.parse(readFileSync(path, 'utf8')));
}

/** Why `id` fails for a dependency on the list `list`, or `null` when it fits. */
function verdict(id, list, published) {
  if (id === 'not declared') return 'which declares no licence';
  if (id === 'not installed') return 'which is not installed, so its licence cannot be read; run pnpm install';
  if (fits(id, list)) return null;
  if (published && fits(id, [...ALLOWED, ...DEV_ONLY])) return `${id}, which no published package may carry`;
  return `${id}, outside NFR-S-07's allowlist`;
}

/** Every licence problem in the workspace at `base`; empty when there is none. */
export function problems(base = root) {
  const found = [];
  for (const { dir, manifest } of workspace(base).filter((entry) => entry.manifest.private !== true)) {
    const runtime = { ...manifest.optionalDependencies, ...manifest.dependencies };
    for (const name of Object.keys(runtime).filter((dependency) => !KIT.test(dependency)).sort()) {
      const reason = verdict(installed(base, dir, name), ALLOWED, true);
      if (reason !== null) found.push(`${manifest.name}: depends on ${name}, ${reason}`);
    }
  }
  for (const { name, version, licence: id, by } of inventory(base).development) {
    const reason = verdict(id, [...ALLOWED, ...DEV_ONLY], false);
    if (reason !== null) found.push(`${by.join(', ')}: develops with ${name}@${version}, ${reason}`);
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = problems();
  if (found.length > 0) {
    for (const problem of found) console.error(problem);
    process.exit(1);
  }
  const { development } = inventory();
  const tools = development.filter(({ licence: id }) => !fits(id, ALLOWED)).length;
  console.log(`licences: ${development.length} development dependencies on NFR-S-07's allowlist, ${tools} of them MPL-2.0 tools; no published package depends on a licence outside it`);
}
