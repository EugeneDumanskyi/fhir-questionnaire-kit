/**
 * The benchmark gate (`03-nfr.md` §1, M2 plan D7): a figure more than 20 %
 * worse than its committed baseline fails, even inside its absolute budget,
 * because a silent 19 % drift per release is how budgets die. The absolute
 * NFR-P-01/02 gates on the 25-item fixture are checked here too; p99 stands in
 * for p95, which is the stricter reading.
 *
 *   node scripts/bench-compare.mjs [results] [baseline]    exit 1 on a failure
 *   node scripts/bench-compare.mjs --update                write the baseline from results (an explicit PR only)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const TOLERANCE = 0.2;

/** NFR-P-01 and NFR-P-02 on the 25-item fixture, in milliseconds. */
export const ABSOLUTE = {
  'NFR-P-01 create session > small-25': 50,
  'NFR-P-02 one answer, cascade depth 5 > small-25': 5,
};

/** Every failure, as `{ name, reason }`; an empty list passes. Names under `reference:` are reported, never gated. */
export function compare(results, baseline) {
  const failures = [];
  for (const [name, limit] of Object.entries(ABSOLUTE)) {
    const figure = results.benchmarks[name];
    if (figure === undefined) failures.push({ name, reason: 'missing from the results' });
    else if (figure.p99Ms > limit) failures.push({ name, reason: `p99 ${figure.p99Ms.toFixed(3)} ms is over the ${limit} ms budget` });
  }
  for (const [name, base] of Object.entries(baseline.benchmarks)) {
    if (name.startsWith('reference:')) continue;
    const figure = results.benchmarks[name];
    if (figure === undefined) failures.push({ name, reason: 'missing from the results' });
    else if (figure.medianMs > base.medianMs * (1 + TOLERANCE)) {
      failures.push({ name, reason: `median ${figure.medianMs.toFixed(4)} ms is ${percent(figure.medianMs, base.medianMs)} over the baseline ${base.medianMs.toFixed(4)} ms` });
    }
  }
  if (results.heapBytes > baseline.heapBytes * (1 + TOLERANCE)) {
    failures.push({ name: 'NFR-P-08 retained heap', reason: `${results.heapBytes} bytes is ${percent(results.heapBytes, baseline.heapBytes)} over the baseline ${baseline.heapBytes}` });
  }
  return failures;
}

const percent = (value, base) => `${Math.round((value / base - 1) * 100)} %`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const resultsPath = args[0] ?? `${root}reports/bench/results.json`;
  const baselinePath = args[1] ?? `${root}benchmarks/baseline.json`;
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, `${JSON.stringify({ ...results, $comment: 'Measured on the CI runner. Change only through an explicit PR (M2 plan D7).' }, null, 2)}\n`);
    console.log(`baseline written: ${baselinePath}`);
  } else {
    const failures = compare(results, JSON.parse(readFileSync(baselinePath, 'utf8')));
    for (const failure of failures) console.error(`FAIL ${failure.name}: ${failure.reason}`);
    if (failures.length > 0) process.exit(1);
    console.log('benchmarks within 20 % of the baseline and inside their budgets');
  }
}
