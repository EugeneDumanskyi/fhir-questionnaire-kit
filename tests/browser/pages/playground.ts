import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { ORIGIN } from './serve.js';

/**
 * The built playground, `apps/playground/dist`, and from M10 the built docs,
 * `apps/docs/dist`, served as GitHub Pages serves them (ADR-0019): static
 * files under a project path, with no header of their own, so each page's
 * `<meta>` policy is the only one. Run `pnpm build:playground` and `pnpm
 * build:docs` first; the specs test what is deployed, not a development server.
 */

/** Where Pages puts it: `/<repo>/playground/`. Relative asset paths (`base: './'`) have to hold under it. */
export const PLAYGROUND = `${ORIGIN}/fhir-questionnaire-kit/playground/`;

/** Where Pages puts the docs: the site's root, `/<repo>/` (M10 plan D2). */
export const DOCS = `${ORIGIN}/fhir-questionnaire-kit/`;

const playgroundDist = fileURLToPath(new URL('../../../apps/playground/dist/', import.meta.url));
const docsDist = fileURLToPath(new URL('../../../apps/docs/dist/', import.meta.url));

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Every file in a build, by its path under the build. */
function files(dist: string, command: string): Map<string, string> {
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`No build in ${dist}: run \`${command}\` first.`);
  const found = new Map<string, string>();
  for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    found.set(relative(dist, path).split(sep).join('/'), path);
  }
  return found;
}

/** Everything the page asked for, and what it got. */
export interface Served {
  readonly requests: { readonly url: string; readonly method: string; readonly status: number }[];
}

/** The built docs' pages, by their path under the site, or none when the docs are not built. */
export function docsPages(): string[] {
  return existsSync(join(docsDist, 'index.html')) ? [...files(docsDist, 'pnpm build:docs').keys()].filter((path) => path.endsWith('.html')).sort() : [];
}

/** Routes the origin to the built playground and records every request; anything outside the build is a 404. */
export function servePlayground(page: Page): Promise<Served> {
  return serve(page, files(playgroundDist, 'pnpm build:playground'), PLAYGROUND);
}

/** Routes the origin to the built docs (M10 plan step 4), the same way, the playground under them a 404. */
export function serveDocs(page: Page): Promise<Served> {
  return serve(page, files(docsDist, 'pnpm build:docs'), DOCS);
}

async function serve(page: Page, built: Map<string, string>, at: string): Promise<Served> {
  const served: Served = { requests: [] };
  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.href.startsWith(at) ? url.pathname.slice(new URL(at).pathname.length).replace(/^$|\/$/, (end) => `${end}index.html`) : undefined;
    const file = path === undefined || url.search !== '' ? undefined : built.get(path);
    const status = file === undefined ? 404 : 200;
    served.requests.push({ url: request.url(), method: request.method(), status });
    if (file === undefined) {
      await route.fulfill({ status, body: '' });
      return;
    }
    await route.fulfill({ status, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) });
  });
  return served;
}
