import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { fits, problems } from '../check-licences.mjs';
import { ALLOWED, DEV_ONLY } from '../inventory.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/licences/', import.meta.url));

/**
 * The licence gate (NFR-S-07, M11 AC-4): each fixture is a workspace as JSON,
 * `{ path: contents }`, written out here with its installed packages, since
 * `node_modules` is not committed. The real workspace is checked in `pnpm lint`.
 */
const scratch = mkdtempSync(join(tmpdir(), 'fhirq-licences-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The workspace of fixture `name`, written under the scratch directory. */
function workspace(name) {
  const files = JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8'));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, name, path)), { recursive: true });
    writeFileSync(join(scratch, name, path), typeof contents === 'string' ? contents : JSON.stringify(contents));
  }
  return join(scratch, name);
}

describe('the licence gate (NFR-S-07, M11 AC-4)', () => {
  it('passes allowlisted licences, MPL-2.0 for a development tool, and an expression one of whose alternatives fits; a consumer project\'s transitive packages are not gated', () => {
    expect(problems(workspace('clean'))).toEqual([]);
  });

  it('fails MPL-2.0 in a published package, and any licence outside the allowlist, in its dependencies, naming each', () => {
    expect(problems(workspace('mpl-in-dependencies'))).toEqual([
      '@fhirq/core: depends on axe, MPL-2.0, which no published package may carry',
      "@fhirq/element: depends on copyleft, GPL-2.0-only, outside NFR-S-07's allowlist",
    ]);
  });

  it('fails a development dependency outside the allowlist, naming who declares it, a consumer project\'s too, read from its lockfile', () => {
    expect(problems(workspace('gpl-dev'))).toEqual([
      "the root, @fhirq/themes: develops with copyleft@2.0.0, GPL-3.0, outside NFR-S-07's allowlist",
      "@fhirq/themes: develops with linter@1.0.0, (MIT AND LGPL-2.1), outside NFR-S-07's allowlist",
      "tests/consumers/bundler: smoke-tests with bundler@8.0.0, GPL-2.0-only, outside NFR-S-07's allowlist",
      'tests/consumers/bundler: smoke-tests with unlocked@?, which its package-lock.json does not name; run node scripts/consumers.mjs --update',
    ]);
  });

  it('fails a package that declares no licence, or is not installed', () => {
    expect(problems(workspace('missing-licence'))).toEqual([
      '@fhirq/core: depends on bare, which declares no licence',
      'the root: develops with absent@1.0.0, which is not installed, so its licence cannot be read; run pnpm install',
      'the root: develops with unlabelled@1.0.0, which declares no licence',
    ]);
  });

  it('reads an SPDX expression by its alternatives and terms', () => {
    const any = [...ALLOWED, ...DEV_ONLY];
    expect(fits('MIT', ALLOWED)).toBe(true);
    expect(fits('MPL-2.0', ALLOWED)).toBe(false);
    expect(fits('MPL-2.0', any)).toBe(true);
    expect(fits('(MIT OR GPL-3.0)', ALLOWED)).toBe(true);
    expect(fits('MIT AND ISC', ALLOWED)).toBe(true);
    expect(fits('(MIT AND GPL-3.0)', any)).toBe(false);
    expect(fits('GPL-3.0 OR (MIT AND Apache-2.0)', ALLOWED)).toBe(true);
    expect(fits('UNLICENSED', any)).toBe(false);
  });

  it('passes the workspace as installed', () => {
    expect(problems()).toEqual([]);
  });
});
