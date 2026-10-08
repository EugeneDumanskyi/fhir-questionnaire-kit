/**
 * The README's published numbers, checked against what enforces them (M10
 * AC-8, plan step 7). The table between `<!-- numbers:start -->` and
 * `<!-- numbers:end -->` has one row per figure, and each figure is read here
 * from its source of truth:
 *
 * - bundle sizes (NFR-S-02, NFR-S-03): `scripts/budgets.json`, the figures the
 *   bundle gate fails on;
 * - nesting and chain depth (NFR-P-05): `NESTING_CEILING` and `CHAIN_CEILING`
 *   in core's `definition/graph.ts`, the constants the load refuses past;
 * - the scale ceiling (NFR-P-04): measured from `fixtures/bench/ceiling.json`,
 *   the fixture the ceiling test and the benchmarks run, and the instance count
 *   that test adds to its repeating group;
 * - the public symbol count (NFR-U-05): counted from the API reports by
 *   `scripts/check-api.mjs`, which fails past its limit.
 *
 * The ceiling fixture must also sit at NFR-P-05's depths, or it no longer
 * tests what the table says it does.
 *
 *   node scripts/check-published-numbers.mjs    exit 1 on a figure out of step
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIMIT, symbols } from './check-api.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export const START = '<!-- numbers:start -->';
export const END = '<!-- numbers:end -->';

const BUDGETS = 'scripts/budgets.json';
const GRAPH = 'packages/core/src/definition/graph.ts';
const CEILING = 'fixtures/bench/ceiling.json';
const CEILING_TEST = 'packages/core/test/property/ceiling.test.ts';

/** A byte budget as published: kilobytes of 1,000 bytes, as NFR-S-02 counts them. */
export const kilobytes = (bytes) => `≤ ${bytes / 1000} kB`;
const count = (value) => value.toLocaleString('en-US');

/** `pattern`'s first group in `text`, as a number; throws naming `source` when it is absent. */
function constant(text, pattern, source) {
  const found = pattern.exec(text)?.[1];
  if (found === undefined) throw new Error(`${source}: ${pattern} not found`);
  return Number(found);
}

/** Items, conditions, deepest group nesting, repeating groups' sizes and the longest condition chain, in edges. */
export function measure(questionnaire) {
  const questions = new Map();
  const repeats = [];
  let items = 0;
  let conditions = 0;
  let nesting = 0;
  const walk = (list, groups) => {
    for (const item of list) {
      items += 1;
      const conditionsOf = item.enableWhen ?? [];
      conditions += conditionsOf.length;
      questions.set(item.linkId, conditionsOf.map((condition) => condition.question));
      const depth = item.type === 'group' ? groups + 1 : groups;
      nesting = Math.max(nesting, depth);
      if (item.type === 'group' && item.repeats === true) repeats.push(item.item?.length ?? 0);
      walk(item.item ?? [], depth);
    }
  };
  walk(questionnaire.item ?? [], 0);
  const memo = new Map();
  const chain = (linkId, seen) => {
    if (memo.has(linkId)) return memo.get(linkId);
    if (seen.has(linkId)) throw new Error(`a condition cycle through ${linkId}`);
    seen.add(linkId);
    const longest = Math.max(0, ...(questions.get(linkId) ?? []).filter((question) => questions.has(question)).map((question) => chain(question, seen) + 1));
    seen.delete(linkId);
    memo.set(linkId, longest);
    return longest;
  };
  const longest = Math.max(0, ...[...questions.keys()].map((linkId) => chain(linkId, new Set())));
  return { items, conditions, nesting, repeats, chain: longest };
}

/**
 * Each published figure, `{ label, value, source }`, in the table's order, read
 * from the repository at `base`. Throws when the ceiling fixture is not at the
 * ceiling it claims.
 */
export function figures(base = root) {
  const read = (path) => readFileSync(join(base, path), 'utf8');
  const { entries } = JSON.parse(read(BUDGETS));
  const graph = read(GRAPH);
  const nestingCeiling = constant(graph, /export const NESTING_CEILING = (\d+);/, GRAPH);
  const chainCeiling = constant(graph, /export const CHAIN_CEILING = (\d+);/, GRAPH);
  const instances = constant(read(CEILING_TEST), /instances\.set\('visit', \{ ordinals: Array\.from\(\{ length: (\d+) \}/, CEILING_TEST);
  const ceiling = measure(JSON.parse(read(CEILING)));
  if (ceiling.repeats.length !== 1) throw new Error(`${CEILING}: expected one repeating group, found ${ceiling.repeats.length}`);
  if (ceiling.nesting !== nestingCeiling) throw new Error(`${CEILING}: nests groups ${ceiling.nesting} deep, but NESTING_CEILING is ${nestingCeiling}`);
  if (ceiling.chain !== chainCeiling) throw new Error(`${CEILING}: its longest condition chain is ${ceiling.chain}, but CHAIN_CEILING is ${chainCeiling}`);

  const budget = (entry, label, nfr) => {
    if (!(entry in entries)) throw new Error(`${BUDGETS}: no entry ${entry}`);
    return { label, value: kilobytes(entries[entry]), source: `${nfr}, [\`budgets.json\`](${BUDGETS})` };
  };
  const scale = (label, value, path = CEILING) => ({ label, value: count(value), source: `NFR-P-04, [\`${path.split('/').at(-1)}\`](${path})` });
  const depth = (label, value) => ({ label, value: count(value), source: `NFR-P-05, [\`graph.ts\`](${GRAPH})` });
  const surface = Object.values(symbols(base)).flat().length;
  return [
    budget('@fhirq/core', '`@fhirq/core`', 'NFR-S-02'),
    budget('@fhirq/core/resume', '`@fhirq/core/resume`, beyond core', 'NFR-S-02'),
    budget('@fhirq/core/view', '`@fhirq/core/view`', 'NFR-S-02'),
    budget('@fhirq/react', '`@fhirq/react`, beyond React and core', 'NFR-S-02'),
    budget('@fhirq/element', '`@fhirq/element`, with core, view and the default theme', 'NFR-S-02'),
    budget('@fhirq/element (IIFE)', '`@fhirq/element` as one `<script>` (IIFE)', 'NFR-S-03'),
    budget('@fhirq/themes/base.css', '`@fhirq/themes/base.css`', 'NFR-S-02'),
    budget('@fhirq/themes/default.css', '`@fhirq/themes` preset, each', 'NFR-S-02'),
    scale('Items in one questionnaire', ceiling.items),
    scale('`enableWhen` conditions', ceiling.conditions),
    scale('Instances of one repeating group', instances, CEILING_TEST),
    scale('Items in one repeat instance', ceiling.repeats[0]),
    depth('Groups nested inside one another', nestingCeiling),
    depth('Conditions in one `enableWhen` chain', chainCeiling),
    { label: 'Public symbols, all packages together', value: `${count(surface)} of at most ${count(LIMIT)}`, source: 'NFR-U-05, [`check-api.mjs`](scripts/check-api.mjs)' },
  ];
}

/** The table as the README carries it, between and including its markers. */
export function table(rows) {
  return [START, '| Figure | Published | Source |', '|---|---|---|', ...rows.map(({ label, value, source }) => `| ${label} | ${value} | ${source} |`), END].join('\n');
}

/** The body rows of the table between the markers, by label, as `{ value, source }`. */
function parse(body) {
  const published = new Map();
  for (const line of body.split('\n')) {
    const cells = /^\|(.*)\|\s*$/.exec(line.trim())?.[1].split('|').map((cell) => cell.trim());
    if (cells === undefined || cells[0] === 'Figure' || /^-+$/.test(cells[0] ?? '')) continue;
    published.set(cells[0], { value: cells[1], source: cells[2] });
  }
  return published;
}

/**
 * What is wrong with the numbers table in `markdown` against `rows`: each
 * figure out of step, missing or unknown, named by its label. Empty when the
 * table matches.
 */
export function check(markdown, rows) {
  const start = markdown.indexOf(START);
  const end = markdown.indexOf(END);
  if (start === -1 || end < start) return [`no table between ${START} and ${END}`];
  const published = parse(markdown.slice(start + START.length, end));
  const problems = [];
  for (const { label, value, source } of rows) {
    const row = published.get(label);
    if (row === undefined) problems.push(`${label}: missing, should be ${value}`);
    else if (row.value !== value) problems.push(`${label}: published as ${row.value}, but its source says ${value}`);
    else if (row.source !== source) problems.push(`${label}: its source is given as ${row.source}, should be ${source}`);
    published.delete(label);
  }
  for (const label of published.keys()) problems.push(`${label}: not a figure this check reads`);
  if (problems.length === 0 && markdown.slice(start, end + END.length) !== table(rows)) problems.push(`the table is out of order or formatted otherwise: expected\n${table(rows)}`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = check(readFileSync(join(root, 'README.md'), 'utf8'), figures());
  for (const problem of problems) console.error(`README.md: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log('README.md: published numbers in step');
}
