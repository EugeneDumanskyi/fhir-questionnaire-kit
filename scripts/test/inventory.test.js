import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { allowed, check, END, inventory, licence, section, START, workspace, write } from '../inventory.mjs';

const base = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(base, path), 'utf8');

/** A workspace in a temporary directory, from `{ path: contents }`; objects are written as JSON. */
function fake(files) {
  const dir = mkdtempSync(join(tmpdir(), 'fhirq-inventory-'));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  return dir;
}

const LOCK = `---
lockfileVersion: '9.0'

packages:

  '@pnpm/exe@12.4.2':
    resolution: {}

---
lockfileVersion: '9.0'

importers:

  .: {}

packages:

  '@fhirq/never-locked@1.0.0':
    resolution: {}

  a@1.0.0:
    resolution: {}

  gpl@2.0.0:
    resolution: {}

snapshots:

  a@1.0.0: {}
`;

const drifted = fake({
  'pnpm-workspace.yaml': "packages:\n  - packages/*\n  - 'tools/one'\n\nallowBuilds:\n  esbuild: true\n",
  'pnpm-lock.yaml': LOCK,
  'package.json': { name: 'fhir-questionnaire-kit', private: true, devDependencies: { a: '1.0.0', gpl: '2.0.0', old: '0.1.0', mpl: '3.0.0', ghost: '1.0.0' } },
  'node_modules/a/package.json': { license: 'MIT' },
  'node_modules/gpl/package.json': { license: { type: 'GPL-3.0' } },
  'node_modules/old/package.json': { licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] },
  'node_modules/mpl/package.json': { license: 'MPL-2.0' },
  'packages/core/package.json': { name: '@fhirq/core', license: 'Apache-2.0' },
  'packages/react/package.json': { name: '@fhirq/react', license: 'Apache-2.0', dependencies: { '@fhirq/core': 'workspace:0.0.0' }, peerDependencies: { react: '^19.0.0' }, devDependencies: { a: '1.0.0' } },
  'packages/react/node_modules/a/package.json': { license: 'MIT' },
  'packages/leaky/package.json': { name: '@fhirq/leaky', license: 'Apache-2.0', dependencies: { 'left-pad': '1.3.0' } },
  'packages/through/package.json': { name: '@fhirq/through', license: 'Apache-2.0', dependencies: { '@fhirq/leaky': 'workspace:0.0.0', '@fhirq/core': 'workspace:0.0.0' } },
  'tools/one/package.json': { name: '@fhirq/one', private: true, dependencies: { a: '1.0.0', '@fhirq/core': 'workspace:0.0.0' } },
  'tools/one/node_modules/a/package.json': { license: 'MIT' },
});

afterAll(() => rmSync(drifted, { recursive: true }));

describe('the dependency inventory (M10 AC-6, plan step 8)', () => {
  it('is in step in the adoption pack, and finds every published package with nothing at runtime', () => {
    const found = inventory();
    expect(found.published.map(({ name }) => name)).toEqual(['@fhirq/core', '@fhirq/element', '@fhirq/react', '@fhirq/themes']);
    for (const entry of found.published) expect([entry.name, entry.direct, entry.transitive]).toEqual([entry.name, [], []]);
    expect(found.development.map(({ name }) => name)).toContain('@cyclonedx/cyclonedx-npm');
    expect(found.development.every(({ name }) => !name.startsWith('@fhirq/'))).toBe(true);
    expect(check(read('docs/adoption.md'), section(found))).toEqual([]);
  });

  it('reads the workspace globs, the root first, and a licence in each of its shapes', () => {
    expect(workspace(drifted).map(({ dir }) => dir)).toEqual(['.', 'packages/core', 'packages/leaky', 'packages/react', 'packages/through', 'tools/one']);
    expect(licence({ license: 'ISC' })).toBe('ISC');
    expect(licence({ license: { type: 'BSD-3-Clause' } })).toBe('BSD-3-Clause');
    expect(licence({ licenses: [{ type: 'MIT' }, 'Apache-2.0'] })).toBe('MIT OR Apache-2.0');
    expect(licence({})).toBe('not declared');
    expect([allowed('0BSD'), allowed('MPL-2.0'), allowed('GPL-3.0'), allowed('not declared')]).toEqual(['yes', 'dev-only tools', '**no**', '**no**']);
  });

  it('counts runtime dependencies outside the kit, direct and through a kit package, and peers apart', () => {
    const { published } = inventory(drifted);
    const row = (name) => published.find((entry) => entry.name === name);
    expect(row('@fhirq/react')).toEqual({ name: '@fhirq/react', licence: 'Apache-2.0', direct: [], transitive: [], kit: ['@fhirq/core'], peers: ['react ^19.0.0'] });
    expect(row('@fhirq/leaky')).toMatchObject({ direct: ['left-pad'], transitive: [] });
    expect(row('@fhirq/through')).toMatchObject({ direct: [], transitive: ['left-pad'], kit: ['@fhirq/leaky', '@fhirq/core'] });
    expect(published.map(({ name }) => name)).not.toContain('@fhirq/one');
  });

  it('lists each development dependency once per version, with who declares it and what licence it carries', () => {
    const { development, locked } = inventory(drifted);
    expect(development).toEqual([
      { name: 'a', version: '1.0.0', licence: 'MIT', by: ['the root', '@fhirq/react', '@fhirq/one'] },
      { name: 'ghost', version: '1.0.0', licence: 'not installed', by: ['the root'] },
      { name: 'gpl', version: '2.0.0', licence: 'GPL-3.0', by: ['the root'] },
      { name: 'mpl', version: '3.0.0', licence: 'MPL-2.0', by: ['the root'] },
      { name: 'old', version: '0.1.0', licence: 'MIT OR Apache-2.0', by: ['the root'] },
    ]);
    expect(locked).toBe(2);
  });

  it('writes what a reviewer must see: a runtime dependency, a licence off the allowlist, and no all-clear', () => {
    const text = section(inventory(drifted));
    expect(text.startsWith(START) && text.endsWith(END)).toBe(true);
    expect(text).toContain('| `@fhirq/leaky` | Apache-2.0 | 1 | 0 | none | none |');
    expect(text).toContain('| `@fhirq/through` | Apache-2.0 | 0 | 1 | `@fhirq/leaky`, `@fhirq/core` | none |');
    expect(text).toContain('| `gpl` | 2.0.0 | GPL-3.0 | **no** | the root |');
    expect(text).toContain('| `a` | 1.0.0 | MIT | yes | the root, `@fhirq/react`, `@fhirq/one` |');
    expect(text).toContain('`pnpm-lock.yaml` resolves 2 third-party packages.');
    expect(section(inventory())).toContain(', every one of them through these.');
  });

  it('fails a stale inventory and a pack without one, and rewrites only between the markers', () => {
    const expected = section(inventory());
    expect(check(readFileSync(new URL('./fixtures/inventory/stale.md', import.meta.url), 'utf8'), expected)).toEqual(['the dependency inventory is out of date: run `pnpm inventory`']);
    expect(check('# Adoption pack\n', expected)).toEqual(['no section between <!-- inventory:start --> and <!-- inventory:end -->']);
    expect(write(`before\n${START}\nold\n${END}\nafter\n`, `${START}\nnew\n${END}`)).toBe(`before\n${START}\nnew\n${END}\nafter\n`);
    expect(() => write('# Adoption pack\n', expected)).toThrow('no section between');
  });
});
