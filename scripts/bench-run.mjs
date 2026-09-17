/**
 * Runs the benchmarks five times and records the median of each run's median
 * (M2 plan D7), so one noisy run cannot move a figure.
 *
 *   node scripts/bench-run.mjs [--runs 5] [--against <checkout>]
 *
 * Writes reports/bench/results.json: milliseconds per benchmark and retained
 * heap bytes for NFR-P-08. With `--against`, another checkout of the
 * repository (the pull request's merge base, installed) is benchmarked in the
 * same job, its runs alternating with this checkout's, and written to
 * reports/bench/reference.json. Hosted runners differ by up to 2× from one job
 * to the next, but agree within about 1 % inside one, so timings are only ever
 * compared within a job (M2 step 12). `bench-compare.mjs` reads both files.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}reports/bench`;

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

/** Run 0 measures this checkout first, run 1 the other first, and so on, so neither side always runs on a warmer machine. */
export function runOrder(sides, run) {
  return run % 2 === 0 ? sides : [...sides].reverse();
}

const option = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};

function benchOnce(side, run) {
  const file = `${out}/vitest-${side.name}-${run}.json`;
  const result = spawnSync('pnpm', ['exec', 'vitest', 'bench', '--run', '--project', 'core', '--outputJson', file], { cwd: side.dir, stdio: 'ignore' });
  if (result.status !== 0) throw new Error(`vitest bench exited ${result.status} in ${side.dir}`);
  for (const [name, figure] of Object.entries(readVitest(JSON.parse(readFileSync(file, 'utf8'))))) {
    (side.samples[name] ??= { median: [], p99: [] }).median.push(figure.median);
    side.samples[name].p99.push(figure.p99);
  }
}

const figures = (samples) =>
  Object.fromEntries(Object.entries(samples).map(([name, figure]) => [name, { medianMs: median(figure.median), p99Ms: median(figure.p99) }]));

async function retainedHeap(runs) {
  const bundle = `${out}/core.mjs`;
  await build({ entryPoints: [`${root}packages/core/src/index.ts`], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent' });
  const heap = [];
  for (let run = 0; run < runs; run += 1) {
    const result = spawnSync(process.execPath, ['--expose-gc', `${root}scripts/bench-heap.mjs`, bundle, `${root}fixtures/bench/ceiling.json`], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`bench-heap exited ${result.status}: ${result.stderr}`);
    heap.push(JSON.parse(result.stdout).heapBytes);
  }
  return median(heap);
}

function print(label, benchmarks) {
  console.log(label);
  for (const [name, figure] of Object.entries(benchmarks)) {
    console.log(`${figure.medianMs.toFixed(4).padStart(10)} ms median  ${figure.p99Ms.toFixed(4).padStart(10)} ms p99  ${name}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const runs = Number(option(args, '--runs') ?? 5) || 5;
  const against = option(args, '--against');
  mkdirSync(out, { recursive: true });

  const sides = [{ name: 'results', dir: root, samples: {} }];
  if (against !== undefined) sides.push({ name: 'reference', dir: resolve(against), samples: {} });
  for (let run = 0; run < runs; run += 1) for (const side of runOrder(sides, run)) benchOnce(side, run);

  const environment = { runs, node: process.version, cpu: { model: cpus()[0]?.model ?? null, cores: availableParallelism() } };
  const results = { ...environment, benchmarks: figures(sides[0].samples), heapBytes: await retainedHeap(runs) };
  writeFileSync(`${out}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`${environment.cpu.cores} cores, ${environment.cpu.model}`);
  print('this checkout', results.benchmarks);
  console.log(`${(results.heapBytes / 1e6).toFixed(2).padStart(10)} MB retained heap  NFR-P-08 ceiling, 50 instances`);
  if (against !== undefined) {
    const reference = { ...environment, checkout: against, benchmarks: figures(sides[1].samples) };
    writeFileSync(`${out}/reference.json`, `${JSON.stringify(reference, null, 2)}\n`);
    print(`reference: ${against}`, reference.benchmarks);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
