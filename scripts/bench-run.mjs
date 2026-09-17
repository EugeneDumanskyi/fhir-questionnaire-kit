/**
 * Runs the benchmarks five times and records the median of each run's median
 * (M2 plan D7), so one noisy run on a shared runner cannot move a figure.
 *
 *   node scripts/bench-run.mjs [--runs 5]
 *
 * Writes reports/bench/results.json: milliseconds per benchmark and retained
 * heap bytes for NFR-P-08. `bench-compare.mjs` reads it.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}reports/bench`;
const runs = Number(process.argv[process.argv.indexOf('--runs') + 1] ?? 5) || 5;

export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** `group > name` → the run's median and p99, in milliseconds. */
export function readVitest(json) {
  const figures = {};
  for (const file of json.files) {
    for (const group of file.groups) {
      const title = group.fullName.split(' > ').slice(1).join(' > ');
      for (const bench of group.benchmarks) figures[`${title} > ${bench.name}`] = { median: bench.median, p99: bench.p99 };
    }
  }
  return figures;
}

async function main() {
  mkdirSync(out, { recursive: true });
  const samples = {};
  for (let run = 0; run < runs; run += 1) {
    const file = `${out}/vitest-${run}.json`;
    const result = spawnSync('pnpm', ['exec', 'vitest', 'bench', '--run', '--project', 'core', '--outputJson', file], { cwd: root, stdio: 'ignore' });
    if (result.status !== 0) throw new Error(`vitest bench exited ${result.status}`);
    for (const [name, figure] of Object.entries(readVitest(JSON.parse(readFileSync(file, 'utf8'))))) {
      (samples[name] ??= { median: [], p99: [] }).median.push(figure.median);
      samples[name].p99.push(figure.p99);
    }
  }

  const bundle = `${out}/core.mjs`;
  await build({ entryPoints: [`${root}packages/core/src/index.ts`], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent' });
  const heap = [];
  for (let run = 0; run < runs; run += 1) {
    const result = spawnSync(process.execPath, ['--expose-gc', `${root}scripts/bench-heap.mjs`, bundle, `${root}fixtures/bench/ceiling.json`], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`bench-heap exited ${result.status}: ${result.stderr}`);
    heap.push(JSON.parse(result.stdout).heapBytes);
  }

  const results = {
    runs,
    node: process.version,
    // Shared runners vary in hardware; the model tells a slower machine from a regression.
    cpu: { model: cpus()[0]?.model ?? null, cores: availableParallelism() },
    benchmarks: Object.fromEntries(
      Object.entries(samples).map(([name, figure]) => [name, { medianMs: median(figure.median), p99Ms: median(figure.p99) }]),
    ),
    heapBytes: median(heap),
  };
  writeFileSync(`${out}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`${results.cpu.cores} cores, ${results.cpu.model}`);
  for (const [name, figure] of Object.entries(results.benchmarks)) {
    console.log(`${figure.medianMs.toFixed(4).padStart(10)} ms median  ${figure.p99Ms.toFixed(4).padStart(10)} ms p99  ${name}`);
  }
  console.log(`${(results.heapBytes / 1e6).toFixed(2).padStart(10)} MB retained heap  NFR-P-08 ceiling, 50 instances`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
