import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { anys, problems } from '../check-api.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/api/', import.meta.url));
const extractor = join(root, 'node_modules', '.bin', 'api-extractor');

const scratch = mkdtempSync(join(tmpdir(), 'fhirq-api-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The fixture package `name`, written to its own directory from `{ path: contents }`. */
function written(name) {
  const dir = join(scratch, name);
  for (const [path, contents] of Object.entries(JSON.parse(readFileSync(join(fixtures, `${name}.json`), 'utf8')))) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`);
  }
  return dir;
}

/** `api-extractor run` in `dir`, as `pnpm api:check` runs it, or with `--local` as `pnpm api:update` does: its exit status and output. */
function run(dir, ...flags) {
  try {
    return { status: 0, output: execFileSync(extractor, ['run', ...flags, '-c', join(dir, 'api-extractor.json')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { status: error.status, output: `${error.stdout}${error.stderr}` };
  }
}

describe('no `any` in the public surface (NFR-M-04, M11 AC-5)', () => {
  it('names each `any` a report declares, by line, and not one in a comment, a string or a property name', () => {
    expect(anys(readFileSync(join(fixtures, 'any.api.md'), 'utf8'))).toEqual([
      { line: 14, text: 'readonly extra: Record<string, any>;' },
      { line: 18, text: 'export function parse(value: any): unknown;' },
      { line: 21, text: 'export const LIST: readonly any[];' },
    ]);
  });

  it('passes every report in the workspace, within NFR-U-05', () => {
    expect(problems()).toEqual([]);
  });
});

describe('the API report diff (NFR-M-04, M11 AC-5)', () => {
  it('fails a package whose report is stale, and passes it once the report is updated', () => {
    const dir = written('stale');
    const stale = run(dir);
    expect(stale.status).not.toBe(0);
    expect(stale.output).toMatch(/You have changed the API signature for this project/);
    expect(run(dir, '--local').status).toBe(0);
    expect(readFileSync(join(dir, 'etc', 'fixture.api.md'), 'utf8')).toContain('export function greet(name: string, greeting?: string): string;');
    expect(run(dir).status).toBe(0);
  }, 60_000);
});
