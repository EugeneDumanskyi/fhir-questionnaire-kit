/**
 * Each published package packed once, as it would be published (M11 plan D7
 * and step 1). The tarballs this writes are the ones the gates read, the
 * SBOMs describe and, from step 8, the release publishes, so what is checked
 * is what ships.
 *
 * `pnpm pack` rather than `npm pack`: pnpm rewrites each `workspace:` range to
 * the exact version it names as it packs.
 *
 *   pnpm build && node scripts/pack.mjs [out]    writes out/<stem>-<version>.tgz, default reports/tarballs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { workspace } from './inventory.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The default directory for the tarballs. */
export const TARBALLS = join(root, 'reports', 'tarballs');

/**
 * Packs each published package of the workspace at `base` into `out`, which
 * is emptied first; returns each tarball's absolute path, by package name.
 * Throws naming a package that has not been built.
 */
export function pack(out = TARBALLS, base = root) {
  const packages = workspace(base).filter(({ manifest }) => manifest.private !== true);
  for (const { dir, manifest } of packages) {
    if (!existsSync(join(base, dir, 'dist'))) throw new Error(`${manifest.name}: no dist; run pnpm build first`);
  }
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const tarballs = new Map();
  for (const { dir, manifest } of packages) {
    const output = execFileSync('pnpm', ['pack', '--json', '--pack-destination', out], { cwd: join(base, dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const { filename } = JSON.parse(output);
    tarballs.set(manifest.name, isAbsolute(filename) ? filename : join(out, filename));
  }
  return tarballs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(process.argv[2] ?? TARBALLS);
  for (const [name, tarball] of pack(out)) console.log(`${name}: ${tarball}`);
}
