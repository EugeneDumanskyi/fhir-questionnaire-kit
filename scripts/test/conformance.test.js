import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { files, PAIRS } from '../gen-conformance-fixtures.mjs';

/**
 * The conformance matrix's shape (M2 plan D6) and the generated operator
 * fixtures. M10 renders the matrix and enforces every link against a passing
 * run (NFR-Q-04); until then a link must at least name a test that exists.
 */

const root = new URL('../../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const matrix = JSON.parse(text('docs/conformance/matrix.json'));
const STATUSES = ['supported', 'partial', 'not supported', 'out of scope'];
const RUNNER = 'packages/core/test/conformance/fixtures.test.ts';

/** Every `DiagnosticCode`, read from the union that declares them. */
const CODES = [...text('packages/core/src/kernel/diagnostic.ts').matchAll(/^\s*\| '([a-z0-9-]+)';?$/gm)].map(([, code]) => code);

/** The files that report on a questionnaire as it loads: the R4 codec, the compiler and the session's opening. */
const LOAD_SOURCES = [
  'packages/core/src/fhir/r4/parse.ts',
  'packages/core/src/open.ts',
  ...readdirSync(new URL('packages/core/src/definition/', root)).map((name) => `packages/core/src/definition/${name}`),
].map(text);

/** Every `<behaviour>: <case>` the conformance runner will name. */
const fixtureCases = readdirSync(new URL('fixtures/', root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(new URL(`fixtures/${entry.name}/scenario.json`, root)))
  .flatMap((entry) => JSON.parse(text(`fixtures/${entry.name}/scenario.json`)).cases.map((testCase) => `${entry.name}: ${testCase.name}`));

describe('the generated operator × type fixtures (M2 AC-1)', () => {
  it('match what the generator writes, byte for byte', () => {
    for (const [path, expected] of files()) expect(text(path), path).toBe(expected);
  });
});

describe('docs/conformance/matrix.json (M2 plan D6)', () => {
  it('has rows of {id, feature, status, reason, tests} and optional diagnostics, with unique ids', () => {
    const ids = matrix.rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of matrix.rows) {
      expect(Object.keys(row).filter((key) => key !== 'diagnostics').sort(), row.id).toEqual(['feature', 'id', 'reason', 'status', 'tests']);
      expect(row.id, row.id).toMatch(/^[a-z][a-z-]*(\.[A-Za-z0-9-]+)+$/);
      expect(STATUSES, row.id).toContain(row.status);
      expect(typeof row.feature, row.id).toBe('string');
      expect(Array.isArray(row.tests), row.id).toBe(true);
    }
  });

  it('gives a reason for every row that is not supported, and none for one that is (AC-13.4.1)', () => {
    for (const row of matrix.rows) {
      if (row.status === 'supported') expect(row.reason, row.id).toBeNull();
      else expect(row.reason, row.id).toMatch(/\S/);
    }
  });

  it('links every supported or partial row to at least one test that exists (NFR-Q-04)', () => {
    for (const row of matrix.rows) {
      if (row.status === 'supported' || row.status === 'partial') expect(row.tests.length, row.id).toBeGreaterThan(0);
      for (const link of row.tests) {
        const [file, ...names] = link.split(' > ');
        expect(existsSync(new URL(file, root)), link).toBe(true);
        if (file === RUNNER) expect(fixtureCases, link).toContain(names.join(' > '));
        else expect(text(file).includes(`'${names[0]}'`), link).toBe(true);
      }
    }
  });

  it('has a supported row for every operator × type pair: 0 gaps (NFR-Q-05)', () => {
    const NAMES = { '=': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'ge', '<=': 'le', exists: 'exists' };
    const rows = matrix.rows.filter((row) => row.id.startsWith('enablewhen.') && row.status === 'supported');
    for (const [type, operator] of PAIRS) {
      const row = rows.find((candidate) => candidate.id === `enablewhen.${type}.${NAMES[operator]}`);
      expect(row?.tests, `${operator} on ${type}`).toContain(`${RUNNER} > enablewhen-${type}: operators on ${type}`);
    }
    expect(PAIRS).toHaveLength(50);
  });

  it('lists only diagnostic codes that exist, each once per row (M9 plan D5)', () => {
    expect(CODES).toContain('control-contract');
    for (const row of matrix.rows.filter((candidate) => 'diagnostics' in candidate)) {
      expect(row.diagnostics.length, row.id).toBeGreaterThan(0);
      expect(new Set(row.diagnostics).size, row.id).toBe(row.diagnostics.length);
      for (const code of row.diagnostics) expect(CODES, row.id).toContain(code);
    }
  });

  it('maps every load-time diagnostic code to at least one row (M9 plan D5)', () => {
    const loadTime = CODES.filter((code) => LOAD_SOURCES.some((source) => source.includes(`'${code}'`)));
    expect(loadTime).toContain('not-r4');
    expect(loadTime).toContain('unsupported-extension');
    const mapped = new Set(matrix.rows.flatMap((row) => row.diagnostics ?? []));
    expect(loadTime.filter((code) => !mapped.has(code))).toEqual([]);
  });

  it('links every conformance fixture case from some row', () => {
    const linked = new Set(matrix.rows.flatMap((row) => row.tests).filter((link) => link.startsWith(`${RUNNER} > `)).map((link) => link.slice(RUNNER.length + 3)));
    expect(fixtureCases.filter((name) => !linked.has(name))).toEqual([]);
  });
});
