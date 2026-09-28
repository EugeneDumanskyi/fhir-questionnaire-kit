import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { check, STATUSES } from '../check-conformance.mjs';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/conformance/${name}.json`, import.meta.url), 'utf8'));
const base = fileURLToPath(new URL('../../', import.meta.url));

describe('the conformance link gate (NFR-Q-04, M10 plan step 1)', () => {
  it('passes links to a describe, a test in one and a top-level test, all passed', () => {
    expect(check(read('passing'), read('report'), { base })).toEqual([]);
  });

  it('fails the fixture that must fail, once per row, naming the reason', () => {
    expect(check(read('failing'), read('report'), { base })).toEqual([
      { id: 'bad.status', reason: 'status "mostly" is not one of supported, partial, not supported, out of scope' },
      { id: 'bad.reason-on-supported', reason: 'a supported row carries no reason' },
      { id: 'bad.no-reason', reason: 'needs a one-line reason' },
      { id: 'bad.two-line-reason', reason: 'needs a one-line reason' },
      { id: 'bad.unlinked', reason: 'a supported row links no test' },
      { id: 'bad.shape', reason: '"packages/core/test/example.test.ts" is not "<file> > <title>"' },
      { id: 'bad.missing-file', reason: 'packages/core/test/gone.test.ts does not exist' },
      { id: 'bad.not-run', reason: 'scripts/check-conformance.mjs did not run' },
      { id: 'bad.title', reason: 'no describe or test in packages/core/test/example.test.ts is titled "enableWhen hides"' },
      { id: 'bad.failed', reason: '"packages/core/test/example.test.ts > scoring": 1 of 2 matched tests did not pass (failed)' },
      { id: 'bad.skipped', reason: '"packages/core/test/example.test.ts > recomputes": 1 of 1 matched tests did not pass (skipped)' },
      { id: 'bad.todo', reason: '"packages/core/test/example.test.ts > a todo": 1 of 1 matched tests did not pass (todo)' },
    ]);
  });

  it('reads the absolute paths a real report carries', () => {
    const report = read('report');
    const absolute = { testResults: report.testResults.map((file) => ({ ...file, name: `${base}${file.name}` })) };
    expect(check(read('passing'), absolute, { base })).toEqual([]);
  });

  it('knows the four statuses AC-13.4.1 names', () => {
    expect(STATUSES).toEqual(['supported', 'partial', 'not supported', 'out of scope']);
  });
});
