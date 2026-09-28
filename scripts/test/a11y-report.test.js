import { describe, expect, it } from 'vitest';

import { DIMENSIONS, html, summarise } from '../a11y-report.mjs';

const run = (cell, violations = []) => ({ name: Object.values(cell).join('-'), cell, axe: '4.11.0', passes: 30, incomplete: 2, violations });
const cell = (overrides) => ({ renderer: 'react', tier: 1, form: 'demo', state: 'loaded', scheme: 'light', width: 375, ...overrides });
const CONTRAST = { id: 'color-contrast', impact: 'serious', help: 'Elements must meet <contrast> thresholds', targets: [['a'], ['b']] };

describe("the axe matrix's report (M8 AC-1)", () => {
  it('orders runs by cell, widths as numbers, and counts violations by rule and node', () => {
    const summary = summarise([run(cell({ width: 1280 })), run(cell({ renderer: 'element' }), [CONTRAST]), run(cell({ width: 375 }))]);
    expect(summary.results.map((result) => `${result.cell.renderer} ${result.cell.width}`)).toEqual(['element 375', 'react 375', 'react 1280']);
    expect(summary).toMatchObject({ runs: 3, failed: 1, rules: { 'color-contrast': 2 }, axe: ['4.11.0'] });
  });

  it('says 0 violations only when there are none, and names each one found, escaped', () => {
    expect(html(summarise([run(cell({}))]), 'now')).toContain('0 violations in 1 runs');
    const page = html(summarise([run(cell({}), [CONTRAST]), run(cell({ scheme: 'dark' }))]), 'now');
    expect(page).toContain('1 of 2 runs with violations');
    expect(page).toContain('color-contrast (2): Elements must meet &#60;contrast&#62; thresholds');
    expect(page).not.toContain('<contrast>');
  });

  it('gives each dimension a column', () => {
    const page = html(summarise([run(cell({}))]), 'now');
    for (const dimension of DIMENSIONS) expect(page).toContain(`<th scope="col">${dimension}</th>`);
  });
});
