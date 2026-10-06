import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { manifests, problems } from '../check-dependencies.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/dependencies/', import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'));

/**
 * The dependency gate (NFR-S-01, AC-14.1.1, M11 AC-2), over the manifests a
 * set of tarballs holds; each fixture is one release's packed manifests. The
 * real packages are packed and checked in CI's `Engine gates`, after the
 * package build.
 */
const scratch = mkdtempSync(join(tmpdir(), 'fhirq-dependencies-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the dependency gate (NFR-S-01, AC-14.1.1, M11 AC-2)', () => {
  it('passes kit dependencies pinned exactly, and react and react-dom as peers of @fhirq/react', () => {
    expect(problems(fixture('clean'))).toEqual([]);
  });

  it('fails each direct dependency outside the kit, each pin that is not exact, and each optional, bundled or extra peer, naming it', () => {
    expect(problems(fixture('direct'))).toEqual([
      '@fhirq/element: pins @fhirq/core to workspace:1.0.0, not exactly 1.0.0',
      '@fhirq/element: depends on @fhirq/gone, which is not published',
      '@fhirq/element: has optionalDependencies, fsevents',
      '@fhirq/element: has peer react, which it may not have',
      '@fhirq/react: pins @fhirq/core to ^1.0.0, not exactly 1.0.0',
      '@fhirq/react: has peer scheduler, which is not react or react-dom',
      '@fhirq/themes: depends on left-pad@1.3.0, outside the kit',
      '@fhirq/themes: has bundleDependencies, normalize.css',
    ]);
  });

  it('fails each package outside the kit reached through a kit package, naming the one it comes through', () => {
    expect(problems(fixture('transitive'))).toEqual([
      '@fhirq/core: depends on tslib@2.8.1, outside the kit',
      '@fhirq/element: reaches tslib through @fhirq/core, outside the kit',
      '@fhirq/react: reaches tslib through @fhirq/view, outside the kit',
      '@fhirq/view: reaches tslib through @fhirq/core, outside the kit',
    ]);
  });

  it('fails packages packed at different versions, and nothing packed', () => {
    const [core, element] = fixture('clean');
    expect(problems([core, { ...element, version: '1.0.1', dependencies: { '@fhirq/core': '1.0.0' } }])).toEqual(['packed versions differ: @fhirq/core@1.0.0, @fhirq/element@1.0.1']);
    expect(problems([])).toEqual(['no tarballs; run node scripts/pack.mjs first']);
  });

  it('reads each manifest from inside its tarball', () => {
    const out = join(scratch, 'out');
    mkdirSync(out);
    for (const manifest of fixture('clean')) {
      const tree = join(scratch, manifest.name.replace('/', '-'));
      mkdirSync(join(tree, 'package'), { recursive: true });
      writeFileSync(join(tree, 'package', 'package.json'), JSON.stringify(manifest));
      execFileSync('tar', ['-czf', join(out, `${manifest.name.replace(/^@/, '').replace('/', '-')}-1.0.0.tgz`), '-C', tree, 'package']);
    }
    expect(manifests(out)).toEqual(fixture('clean'));
    expect(manifests(join(scratch, 'nowhere'))).toEqual([]);
  });
});
