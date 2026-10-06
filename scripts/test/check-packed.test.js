import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { checkPacked } from '../check-packed.mjs';
import { workspace } from '../inventory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/packed/', import.meta.url));
const reference = join(fixtures, 'reference');

/**
 * The packed-contents gate (NFR-S-08, M11 AC-3), over real tarballs: each
 * fixture is a package's files as JSON, packed here with `tar` as npm lays a
 * tarball out, under `package/`. The real packages are packed and checked in
 * CI's `Engine gates`, after the package build.
 */
const scratch = mkdtempSync(join(tmpdir(), 'fhirq-packed-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A directory holding one tarball, of fixture `name`. */
function packed(name) {
  const files = JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'));
  const tree = join(scratch, name, 'tree');
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(tree, 'package', path)), { recursive: true });
    writeFileSync(join(tree, 'package', path), content);
  }
  const out = join(scratch, name, 'out');
  mkdirSync(out);
  execFileSync('tar', ['-czf', join(out, `${name}.tgz`), '-C', tree, 'package']);
  return out;
}

describe('the packed-contents gate (NFR-S-08, M11 AC-3)', () => {
  it('passes package.json, README, LICENSE, NOTICE and dist, with a map whose sources are published', () => {
    expect(checkPacked(packed('clean'), reference)).toEqual([]);
  });

  it('fails each file outside dist, each test and each fixture, naming it', () => {
    expect(checkPacked(packed('extras'), reference)).toEqual([
      '@fhirq/fixture: CHANGELOG.md is not package.json, README, LICENSE, NOTICE or dist',
      '@fhirq/fixture: dist/fixtures/demo.json is a fixture',
      '@fhirq/fixture: dist/index.test.js is a test',
      '@fhirq/fixture: src/index.ts is not package.json, README, LICENSE, NOTICE or dist',
    ]);
  });

  it('fails a source map, in a file or inline, that points at a source the tarball does not hold', () => {
    expect(checkPacked(packed('source-maps'), reference)).toEqual([
      '@fhirq/fixture: dist/index.cjs has an inline map to src/index.ts, which is not published',
      '@fhirq/fixture: dist/index.d.ts.map maps to src/index.ts, which is not published',
    ]);
  });

  it("fails a missing README or NOTICE, a LICENSE that is not the repository's, and a dist without types", () => {
    expect(checkPacked(packed('missing'), reference)).toEqual([
      '@fhirq/fixture: README.md is missing',
      '@fhirq/fixture: NOTICE is missing',
      "@fhirq/fixture: LICENSE differs from the repository's",
      '@fhirq/fixture: dist holds no types',
    ]);
  });

  it('fails when there is nothing packed to check', () => {
    expect(checkPacked(join(scratch, 'nowhere'), reference)).toEqual([`no tarballs in ${join(scratch, 'nowhere')}; run node scripts/pack.mjs first`]);
  });
});

describe('what each published package commits (M11 plan D12)', () => {
  const published = workspace(root).filter(({ manifest }) => manifest.private !== true);

  it('holds a README, and LICENSE and NOTICE equal to the root', () => {
    for (const { dir } of published) {
      const files = readdirSync(join(root, dir));
      expect(files, dir).toContain('README.md');
      for (const file of ['LICENSE', 'NOTICE']) {
        expect(readFileSync(join(root, dir, file), 'utf8'), `${dir}/${file}`).toBe(readFileSync(join(root, file), 'utf8'));
      }
    }
  });

  it('publishes dist without its declaration maps, which point at src, and the README, LICENSE and NOTICE', () => {
    for (const { dir, manifest } of published) {
      expect(manifest.files, dir).toEqual(['dist', '!dist/**/*.map', 'README.md', 'LICENSE', 'NOTICE']);
    }
  });
});
