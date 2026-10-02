/**
 * Every ADR's structure, checked (M10 AC-7, plan step 9; AC-13.3.1). An ADR
 * states its context, the options it weighed with why each lost, its
 * decision, and its consequences with the costs it accepts, in one of the two
 * layouts `docs/adr/README.md` describes:
 *
 * - ADR-0001 to ADR-0006: Context, Decision, Alternatives considered,
 *   Consequences, Verification;
 * - from ADR-0007: Context, Options considered, Decision, Consequences, with
 *   Verification folded into Consequences.
 *
 * Either may end with Follow-ups. Each ADR's status is Proposed, Accepted or
 * Superseded by a named ADR, every amendment note carries its date, and the
 * README's index lists each ADR once, under its own title and status.
 *
 * Whether a claim is defensible (AC-13.3.2) is a reading, not a check: the
 * maintainer's sign-off of the audit is its record.
 *
 *   node scripts/check-adrs.mjs    exit 1 on an ADR out of shape
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const DIR = 'docs/adr';

/** The last ADR written in the first layout. */
export const FIRST_LAYOUT_ENDS = 6;
const FIRST = ['Context', 'Decision', 'Alternatives considered', 'Consequences', 'Verification'];
const SECOND = ['Context', 'Options considered', 'Decision', 'Consequences'];
const OPTIONAL = ['Follow-ups'];

const STATUS = /^(Proposed|Accepted( \d{4}-\d{2}-\d{2})?|Superseded by ADR-\d{4})$/;
const DATE = /\d{4}-\d{2}-\d{2}/;
const NOTE = /^(\*\*Amendment note|\s*\*Amended)/;

/** The `##` sections of `markdown`, in order, each with its body. */
function sections(markdown) {
  const found = [];
  for (const line of markdown.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) found.push({ title: heading[1].trim(), body: [] });
    else found.at(-1)?.body.push(line);
  }
  return found.map(({ title, body }) => ({ title, body: body.join('\n').trim() }));
}

/** An ADR's number, title and status, as its file gives them. */
export function header(markdown) {
  const title = /^# ADR-(\d{4}) — (.+)$/m.exec(markdown);
  const status = /^- \*\*Status:\*\* (.+)$/m.exec(markdown)?.[1].trim();
  return { number: title?.[1], title: title?.[2].trim(), status };
}

/** What is wrong with an ADR's title, status and date, numbered `number`. */
function headed(number, markdown) {
  const problems = [];
  const { number: declared, title, status } = header(markdown);
  if (declared !== number || !title) problems.push(`its title is not "# ADR-${number} — …"`);
  if (status === undefined) problems.push('no Status line');
  else if (!STATUS.test(status)) problems.push(`status "${status}" is not Proposed, Accepted or Superseded by ADR-NNNN`);
  if (!DATE.test(/^- \*\*Date:\*\* (.+)$/m.exec(markdown)?.[1] ?? '')) problems.push('no Date line');
  return problems;
}

/** What is wrong with `found`'s sections against `layout`: missing, unknown, out of order or empty. */
function laidOut(found, layout) {
  const problems = [];
  const titles = found.map((section) => section.title);
  for (const extra of titles.filter((name) => !layout.includes(name) && !OPTIONAL.includes(name))) problems.push(`unexpected section "${extra}"`);
  const missing = layout.filter((name) => !titles.includes(name));
  for (const name of missing) problems.push(`no "${name}" section`);
  const ordered = titles.filter((name) => layout.includes(name));
  if (missing.length === 0 && layout.some((name, i) => ordered.indexOf(name) !== i)) problems.push(`sections out of order: expected ${layout.join(', ')}`);
  for (const { title, body } of found) if (body === '') problems.push(`"${title}" is empty`);
  return problems;
}

/** What is missing from the options and the consequences: a rejection, the costs accepted, and, in the second layout, the verification. */
function argued(found, layout) {
  const problems = [];
  const body = (...names) => found.find((section) => names.includes(section.title))?.body ?? '';
  const options = body('Alternatives considered', 'Options considered');
  if (options !== '' && !/\bRejected\b/.test(options)) problems.push('no option is rejected with a reason');
  const consequences = body('Consequences');
  if (consequences === '') return problems;
  if (!/^\*\*Costs accepted\*\*\s*\n+\S/m.test(consequences)) problems.push('Consequences state no "Costs accepted"');
  if (layout === SECOND && !/^\*\*Verification\*\*/m.test(consequences)) problems.push('Consequences carry no "Verification"');
  return problems;
}

/** What is wrong with the ADR in `file` (its file name) holding `markdown`; empty when nothing is. */
export function check(file, markdown) {
  const number = /^(\d{4})-[a-z0-9-]+\.md$/.exec(file)?.[1];
  if (number === undefined) return [`${file}: not named NNNN-slug.md`];
  const layout = Number(number) <= FIRST_LAYOUT_ENDS ? FIRST : SECOND;
  const found = sections(markdown);
  const undated = markdown
    .split('\n')
    .filter((line) => NOTE.test(line) && !DATE.test(line))
    .map((line) => `an amendment note carries no date: "${line.trim().slice(0, 60)}"`);
  return [...headed(number, markdown), ...laidOut(found, layout), ...argued(found, layout), ...undated].map((problem) => `${file}: ${problem}`);
}

/** What is wrong with the README's index against `adrs`, a list of `{ file, markdown }`; empty when nothing is. */
export function index(readme, adrs) {
  const problems = [];
  const rows = new Map();
  for (const match of readme.matchAll(/^\| \[(\d{4})\]\(([^)]+)\) \| (.+?) \| (.+?) \|/gm)) {
    if (rows.has(match[1])) problems.push(`README: ADR-${match[1]} is indexed twice`);
    rows.set(match[1], { link: match[2], title: match[3].trim(), status: match[4].trim() });
  }
  for (const { file, markdown } of adrs) {
    const { number, title, status } = header(markdown);
    const row = rows.get(number);
    if (row === undefined) {
      problems.push(`README: ADR-${number} is not indexed`);
      continue;
    }
    rows.delete(number);
    if (row.link !== file) problems.push(`README: ADR-${number} links ${row.link}, not ${file}`);
    if (row.title !== title) problems.push(`README: ADR-${number} is indexed as "${row.title}", not "${title}"`);
    if (status !== undefined && row.status.split(' ')[0] !== status.split(' ')[0]) problems.push(`README: ADR-${number} is indexed as ${row.status}, not ${status}`);
  }
  for (const number of rows.keys()) problems.push(`README: ADR-${number} is indexed but has no file`);
  return problems;
}

/** The ADRs under `base`, each as `{ file, markdown }`, in number order. */
export function adrs(base = root) {
  return readdirSync(join(base, DIR))
    .filter((file) => /^\d{4}-.*\.md$/.test(file))
    .sort()
    .map((file) => ({ file, markdown: readFileSync(join(base, DIR, file), 'utf8') }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = adrs();
  const problems = [...all.flatMap(({ file, markdown }) => check(file, markdown)), ...index(readFileSync(join(root, DIR, 'README.md'), 'utf8'), all)];
  for (const problem of problems) console.error(`${DIR}/${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(`${DIR}: ${all.length} ADRs in shape, each indexed`);
}
