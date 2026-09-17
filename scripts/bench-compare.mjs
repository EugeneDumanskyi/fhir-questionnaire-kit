/**
 * The benchmark gate (`03-nfr.md` §1, M2 plan D7 as revised 2026-09-17).
 *
 * - **Timings** fail when a median is more than 20 % over the same benchmark in
 *   the reference run: the merge base, measured in the same job by
 *   `bench-run.mjs --against`. Hosted runners differ by up to 2× between jobs
 *   and about 1 % within one, so a timing is never compared across jobs.
 * - **Retained heap** is deterministic across runners (2.09–2.14 MB), so it
 *   fails more than 20 % over the committed `benchmarks/baseline.json`.
 * - **The absolute NFR-P-01/02 budgets** on the 25-item fixture always apply;
 *   p99 stands in for p95, which is the stricter reading.
 *
 * The committed timings are the published reference figures, not a gate.
 *
 *   node scripts/bench-compare.mjs [--results f] [--reference f] [--baseline f]    exit 1 on a failure
 *   node scripts/bench-compare.mjs --update [--results f] [--baseline f]            write the baseline (an explicit PR only)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const TOLERANCE = 0.2;

/** NFR-P-01 and NFR-P-02 on the 25-item fixture, in milliseconds. */
export const ABSOLUTE = {
  'NFR-P-01 create session > small-25': 50,
  'NFR-P-02 one answer, cascade depth 5 > small-25': 5,
};

/**
 * Every failure, as `{ name, reason }`; an empty list passes. Names under
 * `reference:` are reported, never gated. A benchmark the reference run does
 * not have is new and has nothing to regress from; one this run lacks was
 * removed, which is a review question, not a regression.
 */
export function compare(results, reference, baseline) {
  const failures = [];
  for (const [name, limit] of Object.entries(ABSOLUTE)) {
    const figure = results.benchmarks[name];
    if (figure === undefined) failures.push({ name, reason: 'missing from the results' });
    else if (figure.p99Ms > limit) failures.push({ name, reason: `p99 ${figure.p99Ms.toFixed(3)} ms is over the ${limit} ms budget` });
  }
  for (const [name, figure] of Object.entries(results.benchmarks)) {
    const base = reference?.benchmarks[name];
    if (name.startsWith('reference:') || base === undefined) continue;
    if (figure.medianMs > base.medianMs * (1 + TOLERANCE)) {
      failures.push({ name, reason: `median ${figure.medianMs.toFixed(4)} ms is ${percent(figure.medianMs, base.medianMs)} over the merge base's ${base.medianMs.toFixed(4)} ms` });
    }
  }
  if (results.heapBytes > baseline.heapBytes * (1 + TOLERANCE)) {
    failures.push({ name: 'NFR-P-08 retained heap', reason: `${results.heapBytes} bytes is ${percent(results.heapBytes, baseline.heapBytes)} over the baseline ${baseline.heapBytes}` });
  }
  return failures;
}

const percent = (value, base) => `${Math.round((value / base - 1) * 100)} %`;

const option = (args, name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const resultsPath = option(args, '--results', `${root}reports/bench/results.json`);
  const referencePath = option(args, '--reference', `${root}reports/bench/reference.json`);
  const baselinePath = option(args, '--baseline', `${root}benchmarks/baseline.json`);
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  if (args.includes('--update')) {
    mkdirSync(dirname(baselinePath), { recursive: true });
    const comment = 'Published reference figures, measured on the CI runner; the gate reads heapBytes only. Change through an explicit PR (M2 plan D7).';
    writeFileSync(baselinePath, `${JSON.stringify({ ...results, $comment: comment }, null, 2)}\n`);
    console.log(`baseline written: ${baselinePath}`);
  } else {
    const reference = existsSync(referencePath) ? JSON.parse(readFileSync(referencePath, 'utf8')) : null;
    if (reference === null) console.log('no reference run: timings are not compared, only the absolute budgets and heap');
    const failures = compare(results, reference, JSON.parse(readFileSync(baselinePath, 'utf8')));
    for (const failure of failures) console.error(`FAIL ${failure.name}: ${failure.reason}`);
    if (failures.length > 0) process.exit(1);
    console.log(`benchmarks within 20 % of ${reference === null ? 'nothing (no reference)' : 'the merge base'}, heap within 20 % of the baseline, inside the budgets`);
  }
}
