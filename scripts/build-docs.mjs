/**
 * The docs site (ADR-0019; M10 plan D1, D9; plan step 4).
 *
 * Renders the pages the site publishes from the repository's own Markdown,
 * with marked (ADR-0018 note), to static HTML with one stylesheet, and renders
 * the conformance matrix from `docs/conformance/matrix.json`. Every page opens
 * its `<head>` with ADR-0019's policy and carries no script and no inline
 * style; the build fails rather than write one that does.
 *
 * A link to another published page becomes a link to its HTML. A link to
 * anything else in the repository, a design doc or a source file, goes to
 * that file on GitHub at the commit the site is built from, as do the
 * matrix's test links. Every page is relative to the next, so the site works
 * under Pages' `/<repo>/` and from any local static server.
 *
 *   node scripts/build-docs.mjs     writes apps/docs/dist
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Marked } from 'marked';

const root = fileURLToPath(new URL('..', import.meta.url));

export const REPO = 'https://github.com/EugeneDumanskyi/fhir-questionnaire-kit';

/** ADR-0019's policy, word for word, as the playground's build writes it. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

const SITE = 'FHIR Questionnaire Kit';
const MATRIX = 'docs/conformance/matrix.json';
/** The conformance runner: its links name a fixture case, `<behaviour>: <case>`, not a title in the file. */
const RUNNER = 'packages/core/test/conformance/fixtures.test.ts';

const markdownIn = (base, dir) =>
  existsSync(join(base, dir))
    ? readdirSync(join(base, dir))
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .sort()
    : [];

/**
 * What the site publishes (plan D9), as `{ source, output }` with paths from
 * the repository root and from the site's: the front door, the security
 * policy, the API reference, the accessibility record, the adoption pack,
 * every ADR and guide with their indexes, and the matrix. Only those that
 * exist. Design docs 01–06 are not among them: they link to GitHub.
 */
export function pages(base = root) {
  return [
    { source: 'README.md', output: 'index.html' },
    { source: 'SECURITY.md', output: 'security.html' },
    { source: 'docs/07-api.md', output: 'api.html' },
    { source: 'docs/accessibility.md', output: 'accessibility.html' },
    { source: 'docs/adoption.md', output: 'adoption.html' },
    { source: 'docs/guides/README.md', output: 'guides/index.html' },
    ...markdownIn(base, 'docs/guides').map((name) => ({ source: `docs/guides/${name}`, output: `guides/${name.replace(/\.md$/, '.html')}` })),
    { source: 'docs/adr/README.md', output: 'adr/index.html' },
    ...markdownIn(base, 'docs/adr').map((name) => ({ source: `docs/adr/${name}`, output: `adr/${name.replace(/\.md$/, '.html')}` })),
    { source: MATRIX, output: 'conformance.html' },
  ].filter(({ source }) => existsSync(join(base, source)));
}

/** The site's navigation, in order: each entry's label and output, when that page is published. */
const NAV = [
  ['Home', 'index.html'],
  ['Guides', 'guides/index.html'],
  ['API', 'api.html'],
  ['Conformance', 'conformance.html'],
  ['Decisions', 'adr/index.html'],
  ['Accessibility', 'accessibility.html'],
  ['Adoption', 'adoption.html'],
  ['Security', 'security.html'],
];

/** The URL of site path `to` from the page at site path `from`. */
export function relative(from, to) {
  const path = posix.relative(posix.dirname(from), to);
  return to.endsWith('/') && path !== '' ? `${path}/` : path === '' ? './' : path;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (text) => String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
const unescape = (html) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => Object.keys(ESCAPES).find((character) => ESCAPES[character] === entity) ?? entity);

/** A heading's anchor as GitHub writes it: lower case, punctuation dropped, spaces to hyphens. */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * `href`, written in `source`, as the page at `output` links to it: another
 * published page's HTML, or the file on GitHub at `commit`. A URL or a bare
 * anchor is kept.
 */
export function resolve(href, { source, output, published, commit, base = root }) {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) return href;
  const at = href.indexOf('#');
  const [path, anchor] = at === -1 ? [href, ''] : [href.slice(0, at), href.slice(at)];
  const target = posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(source), decodeURI(path))).replace(/\/$/, '');
  const page = published.get(target) ?? published.get(`${target}/README.md`);
  if (page !== undefined) return `${relative(output, page)}${anchor}`;
  const kind = existsSync(join(base, target)) && statSync(join(base, target)).isDirectory() ? 'tree' : 'blob';
  return `${REPO}/${kind}/${commit}/${encodeURI(target)}${anchor}`;
}

/** A Markdown renderer for one page: headings get GitHub's anchors, and links and images are resolved. */
function renderer(context, images) {
  const seen = new Map();
  return new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'link') token.href = resolve(token.href, context);
      if (token.type === 'image' && !/^[a-z][a-z\d+.-]*:/i.test(token.href)) {
        const target = posix.normalize(posix.join(posix.dirname(context.source), decodeURI(token.href)));
        images.add(target);
        token.href = relative(context.output, `files/${target}`);
      }
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(unescape(html));
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        return `<h${depth} id="${escape(count === 0 ? id : `${id}-${count}`)}">${html}</h${depth}>\n`;
      },
    },
  });
}

/** The first line in `lines` at or after `from` that names `title` as a string. */
const lineOf = (lines, title, from = 0) => {
  const quoted = [`'${title}'`, `"${title}"`, `\`${title}\``];
  const index = lines.findIndex((line, at) => at >= from && quoted.some((text) => line.includes(text)));
  return index === -1 ? undefined : index;
};

/**
 * A matrix test link as `{ text, href }`: a fixture case goes to its
 * scenario, and any other test to its line in its file, both at `commit`.
 */
export function testLink(link, { commit, base = root }) {
  const [file, ...names] = link.split(' > ');
  if (file === RUNNER) {
    const name = names.join(' > ');
    return { text: name, href: `${REPO}/blob/${commit}/fixtures/${name.split(': ')[0]}/scenario.json` };
  }
  const lines = existsSync(join(base, file)) ? readFileSync(join(base, file), 'utf8').split('\n') : [];
  let line = 0;
  for (const name of names) line = lineOf(lines, name, line) ?? line;
  return { text: `${file} › ${names.join(' › ')}`, href: `${REPO}/blob/${commit}/${file}${line > 0 ? `#L${line + 1}` : ''}` };
}

/** The matrix page's heading and body. */
function conformance(matrix, context) {
  const inline = (text) => (text === null ? '' : renderer(context, new Set()).parseInline(text));
  const statuses = ['supported', 'partial', 'not supported', 'out of scope'];
  const groups = Map.groupBy(matrix.rows, (row) => row.id.split('.')[0]);
  const count = (status) => matrix.rows.filter((row) => row.status === status).length;
  const summary = statuses.map((status) => `<tr><th scope="row">${status}</th><td>${count(status)}</td></tr>`).join('\n');
  const sections = [...groups].map(([group, rows]) => {
    const body = rows
      .map((row) => {
        const tests = row.tests.map((link) => testLink(link, context)).map(({ text, href }) => `<li><a href="${escape(href)}">${escape(text)}</a></li>`);
        return [
          `<tr id="${escape(row.id)}">`,
          `<th scope="row"><a href="#${escape(row.id)}"><code>${escape(row.id)}</code></a></th>`,
          `<td>${inline(row.feature)}</td>`,
          `<td><span class="status status-${row.status.replace(/ /g, '-')}">${row.status}</span></td>`,
          `<td>${inline(row.reason)}</td>`,
          `<td>${tests.length === 0 ? '' : `<ul>${tests.join('')}</ul>`}</td>`,
          '</tr>',
        ].join('');
      })
      .join('\n');
    return [
      `<h2 id="group-${escape(group)}"><code>${escape(group)}</code> (${rows.length})</h2>`,
      `<div class="scroll" role="region" aria-labelledby="group-${escape(group)}" tabindex="0">`,
      '<table>',
      '<thead><tr><th scope="col">Row</th><th scope="col">Feature</th><th scope="col">Status</th><th scope="col">Reason</th><th scope="col">Tests</th></tr></thead>',
      `<tbody>\n${body}\n</tbody>`,
      '</table>',
      '</div>',
    ].join('\n');
  });
  const title = 'Conformance matrix';
  const body = [
    `<h1 id="conformance-matrix">${title}</h1>`,
    `<p>Every feature of FHIR R4 Questionnaire the kit is asked about, with its status. A row that is not supported says why. A supported or partial row links the tests that prove it, and CI fails if any of them is missing, skipped or failing (NFR-Q-04). The rows are rendered from <a href="${REPO}/blob/${context.commit}/${MATRIX}"><code>${MATRIX}</code></a> at the commit this site was built from.</p>`,
    `<table class="summary"><caption>${matrix.rows.length} rows</caption>\n<tbody>\n${summary}\n</tbody></table>`,
    ...sections,
  ].join('\n');
  return { title, body };
}

/** The page around `body`: the policy first in `<head>`, the stylesheet, the navigation, and the commit it was built from. */
function layout({ title, body, output, commit, published }) {
  const outputs = new Set(published.values());
  const nav = NAV.filter(([, to]) => outputs.has(to))
    .map(([label, to]) => `<li><a href="${relative(output, to)}"${to === output ? ' aria-current="page"' : ''}>${label}</a></li>`)
    .concat(`<li><a href="${relative(output, 'playground/')}">Playground</a></li>`, `<li><a href="${REPO}">GitHub</a></li>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(output === 'index.html' ? SITE : `${title} · ${SITE}`)}</title>
<link rel="stylesheet" href="${relative(output, 'style.css')}">
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header>
<a class="site" href="${relative(output, 'index.html')}">${SITE}</a>
<nav aria-label="Site">
<ul>
${nav}
</ul>
</nav>
</header>
<main id="content">
${body}
</main>
<footer>
<p>Built from commit <a href="${REPO}/tree/${commit}"><code>${commit.slice(0, 7)}</code></a>. Apache-2.0.</p>
</footer>
</body>
</html>
`;
}

/** Why `html` may not ship under ADR-0019's policy, or `null`. */
export function refused(html) {
  if (!html.startsWith(`<!doctype html>\n<html lang="en">\n<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`)) return 'the policy is not the first element of <head>';
  if (/<script\b/i.test(html)) return 'it has a <script>';
  if (/<style\b/i.test(html)) return 'it has a <style>';
  if (/<[a-z][^>]*\sstyle\s*=/i.test(html)) return 'it has a style attribute';
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) return 'it has an event handler attribute';
  return null;
}

/** Every page, as `{ output, html }`, and the repository files its images need, from `base` at `commit`. */
export function render({ base = root, commit }) {
  const list = pages(base);
  const published = new Map(list.map(({ source, output }) => [source, output]));
  const images = new Set();
  const rendered = list.map(({ source, output }) => {
    const context = { source, output, published, commit, base };
    const text = readFileSync(join(base, source), 'utf8');
    let title;
    let body;
    if (source === MATRIX) ({ title, body } = conformance(JSON.parse(text), context));
    else {
      body = renderer(context, images).parse(text);
      title = unescape(/<h1[^>]*>(.*?)<\/h1>/s.exec(body)?.[1] ?? SITE);
    }
    const html = layout({ title, body, output, commit, published });
    const reason = refused(html);
    if (reason !== null) throw new Error(`${source}: not published, because ${reason} (ADR-0019)`);
    return { output, html };
  });
  return { pages: rendered, images: [...images].sort() };
}

/** Writes the site into `out`, emptied first, with the stylesheet and the images; returns what it wrote. */
export function build({ base = root, out, commit }) {
  const { pages: rendered, images } = render({ base, commit });
  rmSync(out, { recursive: true, force: true });
  const write = (path, content) => {
    mkdirSync(dirname(join(out, path)), { recursive: true });
    writeFileSync(join(out, path), content);
  };
  for (const { output, html } of rendered) write(output, html);
  write('style.css', readFileSync(join(base, 'apps/docs/style.css')));
  for (const image of images) {
    mkdirSync(dirname(join(out, 'files', image)), { recursive: true });
    copyFileSync(join(base, image), join(out, 'files', image));
  }
  return [...rendered.map(({ output }) => output), 'style.css', ...images.map((image) => `files/${image}`)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const commit = process.env['DOCS_COMMIT'] ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const written = build({ out: join(root, 'apps/docs/dist'), commit });
  console.log(`docs: ${written.filter((path) => path.endsWith('.html')).length} pages written to apps/docs/dist at ${commit.slice(0, 7)}`);
}
