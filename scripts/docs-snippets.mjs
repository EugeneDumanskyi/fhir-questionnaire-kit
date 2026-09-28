/**
 * Docs examples, compiled and executed (NFR-Q-08, M10 AC-3; M10 plan step 3).
 *
 * A fenced block in the docs is one of three things:
 *
 * - a snippet: the line above it is `<!-- snippet: path#region -->`, and its
 *   body is that region of that file, a path from the repository root. With no
 *   `#region`, the whole file. The file is typechecked and run somewhere else:
 *   `docs/examples/` for the API reference, each example's own tests for the
 *   examples;
 * - a signature: the line above it is `<!-- signature -->`. A type shape to
 *   read, not code to run, such as an ADR's sketch of an interface;
 * - anything else, which may not be runnable: a `ts`, `tsx`, `js`, `jsx` or
 *   `html` block must be one of the two above.
 *
 * A region runs from a line holding `#region <name>` to one holding
 * `#endregion`, in whatever comment the language has (`// #region create`,
 * `<!-- #region embed -->`). Marker lines are left out, nested ones included,
 * and the region is dedented by its common indentation.
 *
 *   node scripts/docs-snippets.mjs --check    exit 1 on a stale snippet or an unmarked runnable block
 *   node scripts/docs-snippets.mjs --write    rewrite every snippet from its source
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Fence languages that hold code a reader would run. */
export const RUNNABLE = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'typescript', 'javascript', 'html'];

const SNIPPET = /^\s*<!-- snippet: (\S+) -->\s*$/;
const SIGNATURE = /^\s*<!-- signature -->\s*$/;
const OPEN = /^(\s*)(`{3,})([\w-]*)\s*$/;
const REGION = /#region\s+(\S+)/;
const END = /#endregion\b/;

const indentOf = (line) => /^\s*/.exec(line)[0].length;

/** `lines` with their common indentation removed; blank lines stay empty. */
function dedent(lines) {
  const depth = Math.min(...lines.filter((line) => line.trim() !== '').map(indentOf));
  return lines.map((line) => (line.trim() === '' ? '' : line.slice(depth)));
}

/**
 * The lines of region `name` in `source`, or of the whole file when `name` is
 * undefined, without marker lines; `null` when there is no such region or it
 * is never closed.
 */
export function region(source, name) {
  const lines = source.replace(/\n$/, '').split('\n');
  let body = lines;
  if (name !== undefined) {
    const start = lines.findIndex((line) => REGION.exec(line)?.[1] === name);
    if (start === -1) return null;
    let depth = 0;
    const end = lines.findIndex((line, index) => {
      if (index <= start) return false;
      if (REGION.test(line)) depth += 1;
      else if (END.test(line)) depth -= 1;
      return depth < 0;
    });
    if (end === -1) return null;
    body = lines.slice(start + 1, end);
  }
  return dedent(body.filter((line) => !REGION.test(line) && !END.test(line)));
}

/**
 * One Markdown file, with every snippet filled from `read(path)` (the file's
 * text, or `null` when there is none), and its failures as `{ line, reason }`
 * with 1-based line numbers. The output equals the input when nothing is stale.
 */
export function snippets(markdown, read) {
  const lines = markdown.split('\n');
  const output = [];
  const failures = [];
  const fail = (index, reason) => failures.push({ line: index + 1, reason });
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    output.push(line);
    const open = OPEN.exec(line);
    if (open === null) {
      if (SNIPPET.test(line) && !OPEN.test(lines[index + 1] ?? '')) fail(index, 'a snippet comment needs a fenced block on the next line');
      continue;
    }
    const [, indent, fence, language] = open;
    const close = lines.findIndex((candidate, at) => at > index && new RegExp(`^\\s*${fence}\`*\\s*$`).test(candidate));
    if (close === -1) {
      fail(index, 'a fenced block is never closed');
      output.push(...lines.slice(index + 1));
      break;
    }
    const body = lines.slice(index + 1, close);
    const above = lines[index - 1] ?? '';
    const snippet = SNIPPET.exec(above);
    let filled = body;
    if (snippet !== null) {
      const [path, name] = snippet[1].split('#');
      const source = read(path);
      const expected = source === null ? null : region(source, name);
      if (source === null) fail(index, `snippet ${snippet[1]}: ${path} does not exist`);
      else if (expected === null) fail(index, `snippet ${snippet[1]}: no region "${name}" in ${path}, or it is never closed`);
      else {
        filled = expected.map((text) => (text === '' ? '' : `${indent}${text}`));
        if (filled.join('\n') !== body.join('\n')) fail(index, `snippet ${snippet[1]} is stale: run node scripts/docs-snippets.mjs --write`);
      }
    } else if (!SIGNATURE.test(above) && RUNNABLE.includes(language.toLowerCase())) {
      fail(index, `a ${language} block is neither a snippet nor marked <!-- signature -->`);
    }
    output.push(...filled, lines[close]);
    index = close;
  }
  return { output: output.join('\n'), failures };
}

const markdownIn = (base, dir) =>
  existsSync(join(base, dir)) ? readdirSync(join(base, dir)).filter((name) => name.endsWith('.md')).sort().map((name) => `${dir}/${name}`) : [];
const readmesUnder = (base, dir) =>
  existsSync(join(base, dir)) ? readdirSync(join(base, dir)).sort().map((name) => `${dir}/${name}/README.md`) : [];

/**
 * The Markdown that ships as documentation (M10 plan D9), from the repository
 * root: the front door, the security policy, the API reference, the
 * accessibility record, the adoption pack, every ADR and guide, and each
 * example's and package's README. Only those that exist.
 */
export function docs(base = root) {
  return [
    'README.md',
    'SECURITY.md',
    'docs/07-api.md',
    'docs/accessibility.md',
    'docs/adoption.md',
    ...markdownIn(base, 'docs/adr'),
    ...markdownIn(base, 'docs/guides'),
    ...readmesUnder(base, 'examples'),
    ...readmesUnder(base, 'packages'),
  ].filter((path) => existsSync(join(base, path)));
}

/** Every failure in `files` under `base`, as `{ file, line, reason }`, and the files whose snippets are stale, with their filled text. */
export function run(files, base = root) {
  const read = (path) => (existsSync(join(base, path)) ? readFileSync(join(base, path), 'utf8') : null);
  const failures = [];
  const stale = [];
  for (const file of files) {
    const text = readFileSync(join(base, file), 'utf8');
    const result = snippets(text, read);
    failures.push(...result.failures.map((failure) => ({ file, ...failure })));
    if (result.output !== text) stale.push({ file, text: result.output });
  }
  return { failures, stale };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  if (!write && !process.argv.includes('--check')) {
    console.error('usage: node scripts/docs-snippets.mjs --check | --write');
    process.exit(2);
  }
  const files = docs();
  const { failures, stale } = run(files);
  if (write) for (const { file, text } of stale) writeFileSync(join(root, file), text);
  const left = write ? failures.filter((failure) => !failure.reason.includes(' is stale: ')) : failures;
  for (const failure of left) console.error(`${failure.file}:${failure.line}: ${failure.reason}`);
  const blocks = write ? `${stale.length} file${stale.length === 1 ? '' : 's'} rewritten` : `${files.length} files checked`;
  console.log(`docs snippets: ${blocks}, ${left.length === 0 ? 'all in step' : `${left.length} failing`}`);
  process.exitCode = left.length === 0 ? 0 : 1;
}
