import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { adrs, check, FIRST_LAYOUT_ENDS, header, index } from '../check-adrs.mjs';

const fixture = (file) => readFileSync(new URL(`./fixtures/adr/${file}`, import.meta.url), 'utf8');
const README = readFileSync(fileURLToPath(new URL('../../docs/adr/README.md', import.meta.url)), 'utf8');

describe('the ADR structure check (M10 AC-7, plan step 9)', () => {
  it('passes every ADR in the repository, each indexed under its own title and status', () => {
    const all = adrs();
    expect(all).toHaveLength(24);
    expect(all.flatMap(({ file, markdown }) => check(file, markdown))).toEqual([]);
    expect(index(README, all)).toEqual([]);
  });

  it('holds the layout boundary the README states', () => {
    expect(README).toContain(`ADR-0001 to ADR-000${FIRST_LAYOUT_ENDS} use the layout below`);
    expect(README).toContain(`From ADR-000${FIRST_LAYOUT_ENDS + 1} on`);
  });

  it('fails consequences that accept no costs', () => {
    expect(check('0031-no-costs.md', fixture('0031-no-costs.md'))).toEqual(['0031-no-costs.md: Consequences state no "Costs accepted"']);
  });

  it('fails a status outside the three, sections out of order or unknown, no rejected option, and an undated note', () => {
    expect(check('0032-out-of-order.md', fixture('0032-out-of-order.md'))).toEqual([
      '0032-out-of-order.md: status "Approved" is not Proposed, Accepted or Superseded by ADR-NNNN',
      '0032-out-of-order.md: unexpected section "Notes"',
      '0032-out-of-order.md: sections out of order: expected Context, Options considered, Decision, Consequences',
      '0032-out-of-order.md: no option is rejected with a reason',
      '0032-out-of-order.md: an amendment note carries no date: "*Amended (no date given).* The note says when nothing change"',
    ]);
  });

  it('holds the first layout to its own Verification section', () => {
    expect(check('0003-legacy-without-verification.md', fixture('0003-legacy-without-verification.md'))).toEqual([
      '0003-legacy-without-verification.md: no "Verification" section',
    ]);
  });

  it('fails a file misnamed or titled under another number, and an empty section', () => {
    expect(check('notes.md', '# Notes')).toEqual(['notes.md: not named NNNN-slug.md']);
    const empty = fixture('0031-no-costs.md').replace('ADR-0031', 'ADR-0033').replace('A decision whose consequences name only benefits.', '');
    expect(check('0031-no-costs.md', empty)).toEqual([
      '0031-no-costs.md: its title is not "# ADR-0031 — …"',
      '0031-no-costs.md: "Context" is empty',
      '0031-no-costs.md: Consequences state no "Costs accepted"',
    ]);
  });

  it('fails an index that misses, doubles, mistitles, misstates or invents an ADR', () => {
    const adr = { file: '0031-no-costs.md', markdown: fixture('0031-no-costs.md') };
    expect(header(adr.markdown)).toEqual({ number: '0031', title: 'Consequences without their costs', status: 'Accepted' });
    expect(index('', [adr])).toEqual(['README: ADR-0031 is not indexed']);
    const row = (link, title, status) => `| [0031](${link}) | ${title} | ${status} | fixture |\n`;
    expect(index(row('0031-no-costs.md', 'Consequences without their costs', 'Accepted 2026-10-02'), [adr])).toEqual([]);
    expect(index(row('0031-other.md', 'Costs', 'Proposed') + row('0031-no-costs.md', 'x', 'Accepted') + '| [0040](0040-x.md) | Ghost | Accepted | x |\n', [adr])).toEqual([
      'README: ADR-0031 is indexed twice',
      'README: ADR-0031 is indexed as "x", not "Consequences without their costs"',
      'README: ADR-0040 is indexed but has no file',
    ]);
    expect(index(row('0031-other.md', 'Consequences without their costs', 'Proposed'), [adr])).toEqual([
      'README: ADR-0031 links 0031-other.md, not 0031-no-costs.md',
      'README: ADR-0031 is indexed as Proposed, not Accepted',
    ]);
  });
});
