/**
 * The conformance link gate (NFR-Q-04, AC-13.4.1/2; M10 plan step 1).
 *
 * Reads `docs/conformance/matrix.json` against a Vitest JSON report of the
 * `core` project and fails when:
 *
 * - a row's status is not one of the four;
 * - a `supported` row carries a reason, or any other row lacks a one-line one;
 * - a `supported` or `partial` row links no test;
 * - a link is not `<file> > <describe or test title>`, names a file that does
 *   not exist or did not run, or a title no `describe` or test in it carries;
 * - a test a link matches did not pass. Skipped and todo count as failing, so
 *   a `.skip` cannot keep a row `supported`.
 *
 * A link matches every test whose own title or any enclosing `describe` title
 * equals it. `not supported` and `out of scope` rows may link tests (of the
 * diagnostic that reports them, say), and those are held to the same rule.
 *
 *   node scripts/check-conformance.mjs [--report f] [--matrix f]    exit 1 on a failure
 *
 * The report comes from `pnpm test:conformance` or `pnpm test:coverage:core`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export const STATUSES = ['supported', 'partial', 'not supported', 'out of scope'];

const LINKED = new Set(['supported', 'partial']);

/** The report's tests by repository-relative file, each as `{ titles, status }`. */
function testsByFile(report, base) {
  const files = new Map();
  for (const file of report.testResults) {
    const path = isAbsolute(file.name) ? relative(base, file.name) : file.name;
    files.set(
      path.split('\\').join('/'),
      file.assertionResults.map((test) => ({ titles: [...test.ancestorTitles, test.title], status: test.status })),
    );
  }
  return files;
}

function checkRow(row) {
  const failures = [];
  const fail = (reason) => failures.push({ id: row.id, reason });
  if (!STATUSES.includes(row.status)) fail(`status "${row.status}" is not one of ${STATUSES.join(', ')}`);
  if (row.status === 'supported' && row.reason !== null) fail('a supported row carries no reason');
  if (row.status !== 'supported' && (typeof row.reason !== 'string' || !/\S/.test(row.reason) || /\n/.test(row.reason))) {
    fail('needs a one-line reason');
  }
  if (LINKED.has(row.status) && row.tests.length === 0) fail(`a ${row.status} row links no test`);
  return failures;
}

function checkLink(id, link, files, exists) {
  const at = link.indexOf(' > ');
  if (at === -1) return [{ id, reason: `"${link}" is not "<file> > <title>"` }];
  const file = link.slice(0, at);
  const title = link.slice(at + 3);
  const tests = files.get(file);
  if (tests === undefined) return [{ id, reason: exists(file) ? `${file} did not run` : `${file} does not exist` }];
  const matched = tests.filter((test) => test.titles.includes(title));
  if (matched.length === 0) return [{ id, reason: `no describe or test in ${file} is titled "${title}"` }];
  const unpassed = matched.filter((test) => test.status !== 'passed');
  if (unpassed.length === 0) return [];
  const statuses = [...new Set(unpassed.map((test) => test.status))].join(', ');
  return [{ id, reason: `"${link}": ${unpassed.length} of ${matched.length} matched tests did not pass (${statuses})` }];
}

/**
 * Every failure, as `{ id, reason }`; an empty list passes. `base` is the
 * directory report paths and links are relative to; `exists` says whether a
 * linked file is there, to tell a missing file from one that did not run.
 */
export function check(matrix, report, { base = root, exists = (file) => existsSync(join(base, file)) } = {}) {
  const files = testsByFile(report, base);
  return matrix.rows.flatMap((row) => [...checkRow(row), ...row.tests.flatMap((link) => checkLink(row.id, link, files, exists))]);
}

const option = (args, name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const reportPath = option(args, '--report', `${root}reports/core-tests.json`);
  const matrixPath = option(args, '--matrix', `${root}docs/conformance/matrix.json`);
  if (!existsSync(reportPath)) {
    console.error(`no test report at ${reportPath}: run pnpm test:conformance first`);
    process.exit(1);
  }
  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const failures = check(matrix, JSON.parse(readFileSync(reportPath, 'utf8')));
  for (const failure of failures) console.error(`${failure.id}: ${failure.reason}`);
  const links = matrix.rows.reduce((sum, row) => sum + row.tests.length, 0);
  console.log(`${matrix.rows.length} rows, ${links} test links: ${failures.length === 0 ? 'all pass' : `${failures.length} failing`}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}
