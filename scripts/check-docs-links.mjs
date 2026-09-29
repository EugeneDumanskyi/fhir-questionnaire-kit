/**
 * The docs site's link checker (ADR-0019 Verification; M10 plan step 4).
 *
 * Reads every page of the built site and checks every `href` and `src`:
 *
 * - a link within the site resolves to a file, through the mounts the site is
 *   laid out from (the docs at the root, the playground under `playground/`,
 *   as `pages.yml` publishes them), and its anchor names an `id` there;
 * - a link to the repository on GitHub, a file or a directory at any ref,
 *   names a path that exists here. The matrix's test links are among them.
 *
 * Other URLs are not fetched: the check runs offline.
 *
 *   node scripts/check-docs-links.mjs     over apps/docs/dist, with apps/playground/dist under playground/
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO } from './build-docs.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);

/** Every `href` and `src` in `html`, decoded. */
export const links = (html) => [...html.matchAll(/<[a-z][^>]*?\s(?:href|src)="([^"]*)"/gi)].map(([, value]) => decode(value));

/** Every `id` in `html`. */
export const ids = (html) => new Set([...html.matchAll(/\sid="([^"]*)"/g)].map(([, value]) => decode(value)));

/** The HTML files under `dir`, as site paths. */
const htmlUnder = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();

const GITHUB = new RegExp(`^${REPO.replaceAll('.', '\\.')}/(?:blob|tree)/[^/]+/([^#?]+)`);

/**
 * Every broken link on the site, as `{ page, link, reason }`. `mounts` lays
 * the site out as `[prefix, directory]` pairs, the root's prefix `''`; the
 * pages checked are the root mount's. `base` is the repository GitHub links
 * are checked against.
 */
export function check({ mounts, base = root }) {
  const [, site] = mounts.find(([prefix]) => prefix === '') ?? [];
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readFileSync(file, 'utf8'));
    return cache.get(file);
  };
  /** The file at site path `path`, or why there is none. */
  const locate = (path) => {
    const [prefix, dir] = mounts.filter(([candidate]) => path.startsWith(candidate) || `${path}/` === candidate).sort(([a], [b]) => b.length - a.length)[0];
    if (!existsSync(dir)) return { reason: `${prefix} is not built (${dir})` };
    const rest = path.slice(prefix.length);
    const file = join(dir, rest);
    const index = rest === '' || rest.endsWith('/') || (existsSync(file) && statSync(file).isDirectory());
    const found = index ? join(file, 'index.html') : file;
    return existsSync(found) ? { file: found } : { reason: `${path} does not exist` };
  };
  /** Why `link` on `page` is broken, or `null`. */
  const broken = (page, link) => {
    if (link === '') return 'empty link';
    const github = GITHUB.exec(link);
    if (github !== null) {
      const path = decodeURIComponent(github[1]).replace(/\/$/, '');
      return existsSync(join(base, path)) ? null : `${path} is not in the repository`;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('//')) return null;
    const at = link.indexOf('#');
    const [path, anchor] = at === -1 ? [link, ''] : [link.slice(0, at), decodeURIComponent(link.slice(at + 1))];
    let file = join(site, page);
    if (path !== '') {
      const target = posix.normalize(posix.join(posix.dirname(page), decodeURIComponent(path)));
      if (target.startsWith('..')) return 'leaves the site';
      const found = locate(target === '.' || target === './' ? '' : target);
      if (found.file === undefined) return found.reason;
      file = found.file;
    }
    return anchor === '' || ids(read(file)).has(anchor) ? null : `no id "${anchor}" in ${relative(site, file).split(sep).join('/')}`;
  };
  const failures = [];
  for (const page of htmlUnder(site)) {
    for (const link of links(read(join(site, page)))) {
      const reason = broken(page, link);
      if (reason !== null) failures.push({ page, link, reason });
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mounts = [
    ['', join(root, 'apps/docs/dist')],
    ['playground/', join(root, 'apps/playground/dist')],
  ];
  if (!existsSync(join(mounts[0][1], 'index.html'))) {
    console.error('No built docs in apps/docs/dist: run `pnpm build:docs` first.');
    process.exit(2);
  }
  const failures = check({ mounts });
  for (const { page, link, reason } of failures) console.error(`${page}: ${link}: ${reason}`);
  const pages = htmlUnder(mounts[0][1]).length;
  console.log(`docs links: ${pages} pages checked, ${failures.length === 0 ? 'no broken link' : `${failures.length} broken`}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}
