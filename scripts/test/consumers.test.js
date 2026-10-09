import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { CONSUMERS, ENVIRONMENTS, get, serve, smoke, tarballs } from '../consumers.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/consumers/', import.meta.url));

/**
 * The consumer smoke runner (NFR-C-02, M11 AC-1), offline: a stand-in
 * `@fhirq/core` is packed here, and the fixture projects need nothing from a
 * registry. The real environments run in the `Consumer smoke` job.
 */
const scratch = mkdtempSync(join(tmpdir(), 'fhirq-consumers-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const packed = join(scratch, 'tarballs');
mkdirSync(packed);
execFileSync('npm', ['pack', '--pack-destination', packed], { cwd: join(fixtures, 'package'), stdio: 'ignore' });

const project = (name, packages = ['@fhirq/core']) => ({ name, packages, steps: [['check', ['node', 'check.mjs']]] });
const run = (env) => smoke(env, { packages: tarballs(packed), base: join(fixtures, 'projects'), work: join(scratch, 'work', env.name) });

describe('the consumer smoke runner (NFR-C-02, M11 AC-1)', () => {
  it('reads each tarball as its package and version', () => {
    expect(tarballs(packed)).toEqual(new Map([['@fhirq/core', { path: join(packed, 'fhirq-core-1.2.3.tgz'), version: '1.2.3' }]]));
  });

  it('installs the project and the tarball outside the repository, with the form, and runs its steps', async () => {
    const timings = await run(project('ok'));
    expect(Object.keys(timings)).toEqual(['install', 'check']);
    expect(existsSync(join(scratch, 'work', 'ok', 'node_modules', '@fhirq', 'core', 'index.js'))).toBe(true);
  }, 60_000);

  it('serves a directory and nothing outside it', async () => {
    const site = join(scratch, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'index.html'), '<p>form</p>');
    const server = await serve(site);
    try {
      expect(await get(server.origin)).toEqual({ status: 200, body: '<p>form</p>' });
      expect((await get(`${server.origin}/%2e%2e/tarballs/fhirq-core-1.2.3.tgz`)).status).toBe(404);
    } finally {
      await server.close();
    }
  });

  it('holds NFR-C-02\'s six environments, React 18 and 19 among them, each a project with its lockfile', () => {
    const names = ENVIRONMENTS.map(({ name }) => name);
    expect(names).toEqual(['node', 'types', 'vite-react18', 'vite-react19', 'webpack-react18', 'webpack-react19', 'next', 'script-tag']);
    expect(ENVIRONMENTS.find(({ name }) => name === 'node').steps.map(([label]) => label)).toEqual(['esm', 'cjs']);
    for (const name of names) {
      expect(existsSync(join(CONSUMERS, name, 'package.json')), name).toBe(true);
      expect(existsSync(join(CONSUMERS, name, 'package-lock.json')), name).toBe(true);
    }
  });

  describe('must fail', () => {
    it('names the step that fails, with its output', async () => {
      await expect(run(project('broken'))).rejects.toThrow(/^check: node check\.mjs\n[\s\S]*a consumer that fails, with 42/);
    }, 60_000);

    it('fails a project whose package.json and package-lock.json disagree, at install', async () => {
      await expect(run(project('drift'))).rejects.toThrow(/^install: npm ci .*\n[\s\S]*in sync/);
    }, 60_000);

    it('fails a project that needs a package with no tarball', async () => {
      await expect(run(project('ok', ['@fhirq/core', '@fhirq/react']))).rejects.toThrow('install: no tarball for @fhirq/react');
    }, 60_000);
  });
});
