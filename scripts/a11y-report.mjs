/**
 * The published report of M8's axe matrix (NFR-A-01, AC-11.5.1). Each run of
 * `tests/browser/a11y-matrix.spec.ts` leaves its cell and axe's result in
 * `reports/a11y/runs/`; this gathers them into `reports/a11y/report.json`
 * and a page a reader opens, `reports/a11y/index.html`, which CI uploads as
 * the `Accessibility gates` artifact. It reports; the spec is what fails.
 *
 *   node scripts/a11y-report.mjs [--runs dir] [--out dir]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The cell's dimensions, in the order a row reads them. */
export const DIMENSIONS = ['renderer', 'tier', 'form', 'state', 'scheme', 'width'];

/**
 * Every run, ordered by its cell, and the totals: runs, runs with any
 * violation, violations by rule, and axe's versions (one, unless the runs
 * came from different installs).
 */
export function summarise(runs) {
  const key = (run) => DIMENSIONS.map((dimension) => (typeof run.cell[dimension] === 'number' ? String(run.cell[dimension]).padStart(6, '0') : run.cell[dimension])).join(' ');
  const ordered = [...runs].sort((a, b) => key(a).localeCompare(key(b)));
  const rules = {};
  for (const run of ordered) for (const violation of run.violations) rules[violation.id] = (rules[violation.id] ?? 0) + violation.targets.length;
  return {
    runs: ordered.length,
    failed: ordered.filter((run) => run.violations.length > 0).length,
    rules,
    axe: [...new Set(ordered.map((run) => run.axe))],
    results: ordered,
  };
}

const escape = (text) => String(text).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** The report as a page: the totals, then one row per run, its violations named. */
export function html(summary, generated) {
  const verdict = summary.failed === 0 ? `0 violations in ${summary.runs} runs` : `${summary.failed} of ${summary.runs} runs with violations`;
  const rows = summary.results
    .map((run) => {
      const found = run.violations.map((violation) => `${escape(violation.id)} (${violation.targets.length}): ${escape(violation.help)}`).join('<br>');
      return `<tr>${DIMENSIONS.map((dimension) => `<td>${escape(run.cell[dimension])}</td>`).join('')}<td>${run.passes}</td><td>${run.incomplete}</td><td>${found || '0'}</td></tr>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>fhirq accessibility matrix</title></head>
<body>
<main>
<h1>fhirq accessibility matrix</h1>
<p>${escape(verdict)}. axe-core ${summary.axe.map(escape).join(', ')}, WCAG 2.0, 2.1 and 2.2 at A and AA. Generated ${escape(generated)}.</p>
<table>
<caption>One row per run. Passed and review count axe's rules; violations name each rule and its nodes.</caption>
<thead><tr>${DIMENSIONS.map((dimension) => `<th scope="col">${dimension}</th>`).join('')}<th scope="col">passed</th><th scope="col">review</th><th scope="col">violations</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</main>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const runs = option('--runs', join(root, 'reports/a11y/runs'));
  const out = option('--out', join(root, 'reports/a11y'));
  const summary = summarise(
    (existsSync(runs) ? readdirSync(runs) : [])
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8'))),
  );
  mkdirSync(out, { recursive: true });
  const generated = new Date().toISOString();
  writeFileSync(join(out, 'report.json'), `${JSON.stringify({ generated, ...summary }, null, 2)}\n`);
  writeFileSync(join(out, 'index.html'), html(summary, generated));
  console.log(`${summary.runs} runs, ${summary.failed} with violations: ${join(out, 'index.html')}`);
}
