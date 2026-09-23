/**
 * The mutation lane split into jobs by module (NFR-Q-03, A6), the relief spike
 * S2 named for K1 before any cut (`00-s2-mutation-cost.md` §5, §7). Every
 * module stays mutated; the wall-clock divides across runners. M5 took the
 * view's mutants past what one 4-core job holds.
 *
 * `stryker.config.json`'s `mutate` stays the whole list, so `pnpm test:mutation`
 * still runs everything locally. The shards here partition it exactly: a module
 * added there and not here, or named twice, fails `--check` and every shard.
 * Each shard keeps its own incremental file, since Stryker drops the results of
 * modules outside the run it is given.
 *
 *   node scripts/mutation-shard.mjs --check               exit 1 unless SHARDS partitions `mutate`
 *   node scripts/mutation-shard.mjs <shard> [stryker args] run one shard, e.g. `view-tree --force`
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const src = (path) => `packages/core/src/${path}.ts`;

/** Shard name to the modules it mutates; the CI matrices name the same shards. */
export const SHARDS = {
  enablement: ['definition/graph', 'definition/scc', 'session/conditions', 'session/enablement', 'session/heap', 'session/store', 'kernel/compare'].map(src),
  session: ['session/session', 'session/guard', 'session/options', 'session/collaborator', 'session/calculated'].map(src),
  rules: ['validation/built-in', 'validation/rules', 'validation/validate', 'validation/scores', 'interchange/emit'].map(src),
  'view-tree': ['view/view', 'view/build'].map(src),
  'view-parts': ['view/controls', 'view/drafts', 'view/format', 'view/catalogue', 'view/summary', 'view/announce', 'view/focus', 'view/ids'].map(src),
};

/** Every way `shards` fails to partition `mutate`, as sentences; an empty list passes. */
export function partitionProblems(mutate, shards) {
  const problems = [];
  const owner = new Map();
  for (const [name, files] of Object.entries(shards)) {
    if (files.length === 0) problems.push(`shard ${name} mutates nothing`);
    for (const file of files) {
      const other = owner.get(file);
      if (other !== undefined) problems.push(`${file} is in shards ${other} and ${name}`);
      else owner.set(file, name);
      if (!mutate.includes(file)) problems.push(`${file} (shard ${name}) is not in stryker.config.json's mutate`);
    }
  }
  for (const file of mutate) if (!owner.has(file)) problems.push(`${file} is in stryker.config.json's mutate and in no shard`);
  return problems;
}

/** The Stryker arguments that run one shard. */
export function strykerArgs(shard, files, extra = []) {
  return ['run', '--mutate', files.join(','), '--incrementalFile', `reports/stryker/${shard}/incremental.json`, ...extra];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [shard, ...extra] = process.argv.slice(2);
  const { mutate } = JSON.parse(readFileSync(`${root}stryker.config.json`, 'utf8'));
  const problems = partitionProblems(mutate, SHARDS);
  for (const problem of problems) console.error(`FAIL ${problem}`);
  if (problems.length > 0) process.exit(1);
  if (shard === '--check') {
    console.log(`${Object.keys(SHARDS).length} shards partition ${mutate.length} mutated modules`);
  } else {
    const files = SHARDS[shard];
    if (files === undefined) {
      console.error(`unknown shard ${shard}; one of ${Object.keys(SHARDS).join(', ')}`);
      process.exit(1);
    }
    const run = spawnSync(`${root}node_modules/.bin/stryker`, strykerArgs(shard, files, extra), { cwd: root, stdio: 'inherit' });
    process.exit(run.status ?? 1);
  }
}
