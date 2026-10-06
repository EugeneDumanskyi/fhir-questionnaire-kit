/**
 * The packed-contents gate (NFR-S-08, M11 AC-3; plan D12 and step 1).
 *
 * A published tarball holds `package.json`, `README.md`, `LICENSE`, `NOTICE`
 * and `dist/**`, and nothing else. Inside `dist`: no test, no fixture, and no
 * source map, in a file or inline, that names a source the tarball does not
 * hold. `LICENSE` and `NOTICE` are the repository root's, byte for byte, and
 * `dist` holds the types.
 *
 * It reads the tarballs `scripts/pack.mjs` wrote, unpacked, so it judges what
 * would be published, not what the `files` field meant to publish.
 *
 *   pnpm build && node scripts/pack.mjs && node scripts/check-packed.mjs [dir]    exit 1 naming each offending file, default reports/tarballs
 */

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARBALLS } from './pack.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The files allowed beside `dist`, each required. */
export const REQUIRED = ['package.json', 'README.md', 'LICENSE', 'NOTICE'];

/** The two files that must equal the repository root's. */
const COPIES = ['LICENSE', 'NOTICE'];

const TEST = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const FIXTURE = /(^|\/)fixtures?\//;
const INLINE = /[#@] sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?;base64,([A-Za-z0-9+/=]+)/;
const SCRIPT = /\.(?:[cm]?js|d\.[cm]?ts)$/;

/** Every file under `dir`, as a POSIX path relative to it, sorted. */
export function listing(dir) {
  const files = [];
  const walk = (at) => {
    for (const entry of readdirSync(join(dir, at), { withFileTypes: true })) {
      const path = at === '' ? entry.name : `${at}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk('');
  return files.sort();
}

/** The sources a source map at `path` names, resolved from the package root, that are not among `files`. */
function missingSources(map, path, files) {
  const base = posix.join(posix.dirname(path), map.sourceRoot ?? '');
  return (map.sources ?? []).filter((source) => source !== null).map((source) => posix.normalize(posix.join(base, source))).filter((source) => !files.includes(source));
}

/** Why `path` may not be published, or `null` when it may. */
function placement(path) {
  if (!REQUIRED.includes(path) && !path.startsWith('dist/')) return 'is not package.json, README, LICENSE, NOTICE or dist';
  if (TEST.test(path)) return 'is a test';
  if (FIXTURE.test(path)) return 'is a fixture';
  return null;
}

/** Why the source map in or beside `path` may not be published, or `null` when it may. */
function mapping(path, files, read) {
  if (path.endsWith('.map')) {
    const missing = missingSources(JSON.parse(read(path)), path, files);
    return missing.length > 0 ? `maps to ${missing.join(', ')}, which is not published` : null;
  }
  const inline = SCRIPT.test(path) ? INLINE.exec(read(path)) : null;
  if (inline === null) return null;
  const missing = missingSources(JSON.parse(Buffer.from(inline[1], 'base64').toString('utf8')), path, files);
  return missing.length > 0 ? `has an inline map to ${missing.join(', ')}, which is not published` : null;
}

/**
 * What is wrong with the unpacked package `dir`, published as `name`, against
 * the `LICENSE` and `NOTICE` in `reference`; empty when nothing is.
 */
export function problems(name, dir, reference = root) {
  const files = listing(dir);
  const read = (path) => readFileSync(join(dir, path), 'utf8');
  const found = [];
  for (const path of files) {
    for (const reason of [placement(path), mapping(path, files, read)]) {
      if (reason !== null) found.push(`${name}: ${path} ${reason}`);
    }
  }
  for (const path of REQUIRED.filter((required) => !files.includes(required))) found.push(`${name}: ${path} is missing`);
  for (const path of COPIES.filter((copy) => files.includes(copy) && read(copy) !== readFileSync(join(reference, copy), 'utf8'))) {
    found.push(`${name}: ${path} differs from the repository's`);
  }
  if (!files.some((path) => /^dist\/.*\.d\.[cm]?ts$/.test(path))) found.push(`${name}: dist holds no types`);
  return found;
}

/** Unpacks each `.tgz` in `dir` and returns every problem, by package, against `reference`. */
export function checkPacked(dir = TARBALLS, reference = root) {
  const tarballs = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.tgz')).sort() : [];
  if (tarballs.length === 0) return [`no tarballs in ${dir}; run node scripts/pack.mjs first`];
  const scratch = mkdtempSync(join(tmpdir(), 'fhirq-packed-'));
  try {
    const found = [];
    for (const tarball of tarballs) {
      const into = join(scratch, tarball);
      mkdirSync(into);
      execFileSync('tar', ['-xzf', join(dir, tarball), '-C', into, '--strip-components', '1']);
      const manifest = join(into, 'package.json');
      const name = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).name : tarball;
      found.push(...problems(name, into, reference));
    }
    return found;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = resolve(process.argv[2] ?? TARBALLS);
  const found = checkPacked(dir);
  if (found.length > 0) {
    for (const problem of found) console.error(problem);
    process.exit(1);
  }
  const count = readdirSync(dir).filter((file) => file.endsWith('.tgz')).length;
  console.log(`packed contents: ${count} tarballs, each package.json, README, LICENSE, NOTICE and dist only`);
}
