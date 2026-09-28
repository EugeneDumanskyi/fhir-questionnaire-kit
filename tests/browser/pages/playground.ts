import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { ORIGIN } from './serve.js';

/**
 * The built playground, `apps/playground/dist`, served as GitHub Pages serves
 * it (ADR-0019): static files under a project path, with no header of its own,
 * so the page's `<meta>` policy is the only one. Run `pnpm build:playground`
 * first; the specs test what is deployed, not the development server.
 */

/** Where Pages puts it: `/<repo>/playground/`. Relative asset paths (`base: './'`) have to hold under it. */
export const PLAYGROUND = `${ORIGIN}/fhir-questionnaire-kit/playground/`;

const dist = fileURLToPath(new URL('../../../apps/playground/dist/', import.meta.url));

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

/** Every file in the build, by its path under the playground. */
function files(): Map<string, string> {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('No built playground in apps/playground/dist: run `pnpm build:playground` first.');
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

/** Routes the origin to the build and records every request; anything outside the build is a 404. */
export async function servePlayground(page: Page): Promise<Served> {
  const built = files();
  const served: Served = { requests: [] };
  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.href.startsWith(PLAYGROUND) ? url.pathname.slice(new URL(PLAYGROUND).pathname.length).replace(/^$|\/$/, 'index.html') : undefined;
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
