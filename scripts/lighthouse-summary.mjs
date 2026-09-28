/**
 * The playground's Lighthouse numbers, run by run (NFR-P-06; M9 plan D10).
 *
 *   node scripts/lighthouse-summary.mjs    print the table, and append it to the job summary on CI
 *
 * `lhci upload` writes each run's report to `reports/lighthouse`, and this
 * reads them. The gate is `lhci assert`, on the median run; this only
 * records what the runner measured, so the margin to each threshold is on
 * the record whether the gate passed or not.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../reports/lighthouse/', import.meta.url));
const runs = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8'));

const rows = runs.map((run) => {
  const report = JSON.parse(readFileSync(run.jsonPath, 'utf8'));
  const audit = (id) => report.audits[id].numericValue;
  return [
    run.isRepresentativeRun ? 'median' : '',
    String(Math.round(report.categories.performance.score * 100)),
    `${(audit('largest-contentful-paint') / 1000).toFixed(2)} s`,
    `${Math.round(audit('total-blocking-time'))} ms`,
    audit('cumulative-layout-shift').toFixed(3),
    String(Math.round(report.environment.benchmarkIndex)),
  ];
});

const table = [
  '| Run | Performance | LCP | TBT | CLS | Benchmark index |',
  '|---|---|---|---|---|---|',
  ...rows.map((row, i) => `| ${i + 1} ${row[0]} | ${row.slice(1).join(' | ')} |`),
  '| **NFR-P-06** | ≥ 90 | ≤ 2.50 s | ≤ 200 ms | ≤ 0.100 | |',
].join('\n');

console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse, the playground\n\n${table}\n`);
