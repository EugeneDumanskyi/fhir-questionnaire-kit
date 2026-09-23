import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { partitionProblems, SHARDS, strykerArgs } from '../mutation-shard.mjs';

const { mutate } = JSON.parse(readFileSync(new URL('../../stryker.config.json', import.meta.url), 'utf8'));
const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const nightly = readFileSync(new URL('../../.github/workflows/nightly.yml', import.meta.url), 'utf8');

describe('mutation-shard', () => {
  it('partitions stryker.config.json\'s mutate list exactly', () => {
    expect(partitionProblems(mutate, SHARDS)).toEqual([]);
  });

  it('names every way a partition can fail', () => {
    expect(partitionProblems(['a.ts', 'b.ts', 'c.ts'], { one: ['a.ts', 'b.ts'], two: ['b.ts', 'd.ts'], three: [] })).toEqual([
      'b.ts is in shards one and two',
      'd.ts (shard two) is not in stryker.config.json\'s mutate',
      'shard three mutates nothing',
      'c.ts is in stryker.config.json\'s mutate and in no shard',
    ]);
  });

  it('gives each shard its own incremental file and passes extra arguments through', () => {
    expect(strykerArgs('view', ['x.ts', 'y.ts'], ['--force'])).toEqual([
      'run', '--mutate', 'x.ts,y.ts', '--incrementalFile', 'reports/stryker/view/incremental.json', '--force',
    ]);
  });

  it('runs every shard in both the pull-request and the nightly matrix', () => {
    const matrix = `shard: [${Object.keys(SHARDS).join(', ')}]`;
    expect(ci).toContain(matrix);
    expect(nightly).toContain(matrix);
  });
});
