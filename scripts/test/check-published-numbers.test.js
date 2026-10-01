import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { check, figures, kilobytes, measure, table } from '../check-published-numbers.mjs';

const base = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(base, path), 'utf8');
const value = (rows, label) => rows.find((row) => row.label === label)?.value;

/** A copy of the files `figures` reads, with `edit` applied to one of them. */
function repository(path, edit) {
  const copy = mkdtempSync(join(tmpdir(), 'fhirq-numbers-'));
  for (const file of ['scripts/budgets.json', 'packages/core/src/definition/graph.ts', 'fixtures/bench/ceiling.json', 'packages/core/test/property/ceiling.test.ts']) {
    cpSync(join(base, file), join(copy, file), { recursive: true });
  }
  writeFileSync(join(copy, path), edit(read(path)));
  return copy;
}

describe('the published numbers check (M10 AC-8, plan step 7)', () => {
  it('reads each figure from what enforces it, and the README publishes them all in step', () => {
    const rows = figures();
    const { entries } = JSON.parse(read('scripts/budgets.json'));
    expect(value(rows, '`@fhirq/core`')).toBe(kilobytes(entries['@fhirq/core']));
    expect(value(rows, '`@fhirq/element` as one `<script>` (IIFE)')).toBe(kilobytes(entries['@fhirq/element (IIFE)']));
    expect(value(rows, 'Items in one questionnaire')).toBe('1,000');
    expect(value(rows, '`enableWhen` conditions')).toBe('500');
    expect(value(rows, 'Instances of one repeating group')).toBe('50');
    expect(value(rows, 'Items in one repeat instance')).toBe('20');
    expect(value(rows, 'Groups nested inside one another')).toBe('10');
    expect(value(rows, 'Conditions in one `enableWhen` chain')).toBe('10');
    expect(check(read('README.md'), rows)).toEqual([]);
  });

  it('publishes a budget in kB of 1,000 bytes, as NFR-S-02 counts them', () => {
    expect(kilobytes(15_000)).toBe('≤ 15 kB');
    expect(kilobytes(8_200)).toBe('≤ 8.2 kB');
    expect(kilobytes(31_900)).toBe('≤ 31.9 kB');
  });

  it('fails a drifted table, naming each figure: wrong, missing, unsourced or unknown', () => {
    expect(check(readFileSync(new URL('./fixtures/numbers/stale.md', import.meta.url), 'utf8'), figures())).toEqual([
      '`@fhirq/core`: published as ≤ 14 kB, but its source says ≤ 15 kB',
      'Items in one repeat instance: missing, should be 20',
      'Groups nested inside one another: its source is given as NFR-P-05, should be NFR-P-05, [`graph.ts`](packages/core/src/definition/graph.ts)',
      'Time to first render: not a figure this check reads',
    ]);
  });

  it('fails a README with no table, and one whose rows are in step but out of order', () => {
    const rows = figures();
    expect(check('# README\n', rows)).toEqual(['no table between <!-- numbers:start --> and <!-- numbers:end -->']);
    const swapped = table([rows[1], rows[0], ...rows.slice(2)]);
    expect(check(swapped, rows)).toHaveLength(1);
    expect(check(swapped, rows)[0]).toMatch(/^the table is out of order or formatted otherwise/);
  });

  it('follows a budget, or a ceiling constant, when its source changes', () => {
    const budget = repository('scripts/budgets.json', (text) => text.replace('"@fhirq/core": 15000', '"@fhirq/core": 14500'));
    const constant = repository('packages/core/src/definition/graph.ts', (text) => text.replace('NESTING_CEILING = 10', 'NESTING_CEILING = 12'));
    try {
      expect(check(read('README.md'), figures(budget))).toEqual(['`@fhirq/core`: published as ≤ 15 kB, but its source says ≤ 14.5 kB']);
      expect(() => figures(constant)).toThrow('ceiling.json: nests groups 10 deep, but NESTING_CEILING is 12');
    } finally {
      rmSync(budget, { recursive: true });
      rmSync(constant, { recursive: true });
    }
  });

  it('measures items, conditions, nesting, repeating groups and the longest chain in edges', () => {
    const yes = (question) => [{ question, operator: '=', answerBoolean: true }];
    const questionnaire = {
      item: [
        { linkId: 'a', type: 'boolean' },
        { linkId: 'b', type: 'boolean', enableWhen: yes('a') },
        {
          linkId: 'g',
          type: 'group',
          repeats: true,
          item: [
            { linkId: 'c', type: 'boolean', enableWhen: [...yes('b'), ...yes('a')] },
            { linkId: 'h', type: 'group', item: [{ linkId: 'd', type: 'string', enableWhen: yes('c') }] },
          ],
        },
      ],
    };
    expect(measure(questionnaire)).toEqual({ items: 6, conditions: 4, nesting: 2, repeats: [2], chain: 3 });
    expect(() => measure({ item: [{ linkId: 'x', type: 'boolean', enableWhen: yes('y') }, { linkId: 'y', type: 'boolean', enableWhen: yes('x') }] })).toThrow('a condition cycle through');
  });
});
