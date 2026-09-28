import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page, type Request } from '@playwright/test';

import { PLAYGROUND, servePlayground, type Served } from './pages/playground.js';
import { ORIGIN } from './pages/serve.js';

/**
 * The playground's privacy claim (M9 AC-5, AC-12.3.2; ADR-0019 and its
 * 2026-09-28 note), in Chromium, Firefox and WebKit. The policy is the first
 * element of `<head>` and forbids connections; the browser enforces it; and
 * across load, a paste carrying a sentinel, answers and every tier and
 * scheme, the page makes only D4's requests: a same-origin `GET`, with no
 * query and no body, for a file in the build, none carrying the sentinel and
 * none after the lazy chunks settle. The page breaks none of the policy.
 */

const POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'";

const dist = fileURLToPath(new URL('../../apps/playground/dist/', import.meta.url));
/** What the page may load: the page and every built script and stylesheet, never a source map. */
const built = new Set(['', ...readdirSync(`${dist}assets`).filter((file) => !file.endsWith('.map')).map((file) => `assets/${file}`)]);

/** Text a user pastes and types, which must never reach a request. */
const SENTINEL = 'sentinel-3b9f0c-do-not-send';

interface Logged {
  readonly url: string;
  readonly method: string;
  readonly body: string | null;
  readonly headers: string;
}

/**
 * Every request the page's context starts, to any origin, even one the
 * browser then blocks, and every WebSocket it opens; and what reached the
 * server. Nothing outside the build leaves the machine.
 */
async function record(page: Page): Promise<{ readonly requests: Logged[]; readonly sockets: string[]; readonly served: Served }> {
  const log = { requests: [] as Logged[], sockets: [] as string[] };
  page.context().on('request', (request: Request) => {
    log.requests.push({ url: request.url(), method: request.method(), body: request.postData(), headers: JSON.stringify(request.headers()) });
  });
  page.on('websocket', (socket) => log.sockets.push(socket.url()));
  await page.route((url) => !url.href.startsWith(`${ORIGIN}/`), (route) => route.abort());
  return { ...log, served: await servePlayground(page) };
}

/** Counts every policy violation from before the first script runs. */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { fhirqViolations: violations });
    document.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective} ${event.blockedURI}`), true);
  });
  return () => page.evaluate(() => (window as unknown as { fhirqViolations: string[] }).fhirqViolations);
}

const editor = (page: Page) => page.getByRole('region', { name: 'Paste your own Questionnaire', exact: true });
const form = (page: Page) => page.getByRole('region', { name: 'Demonstration form', exact: true });
const switcher = (page: Page) => page.getByRole('region', { name: 'Customization tiers', exact: true });

/** The lazy chunks are in: the switcher, the panes and the editor are on the page, and the network is quiet. */
async function settled(page: Page): Promise<void> {
  await expect(switcher(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'The response and the engine state', exact: true })).toBeAttached();
  await expect(editor(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

const pasted = JSON.stringify(
  {
    resourceType: 'Questionnaire',
    status: 'active',
    item: [
      { linkId: 'secret', text: `Something private (${SENTINEL})`, type: 'string' },
      { linkId: 'shared', text: 'Share it?', type: 'boolean' },
    ],
  },
  null,
  2,
);

test('carries the policy as the first element of <head>, as served and as parsed', async ({ page }) => {
  const html = readFileSync(`${dist}index.html`, 'utf8');
  expect(/<head>\s*(<[^>]*>)/.exec(html)?.[1]).toBe(`<meta http-equiv="Content-Security-Policy" content="${POLICY}" />`);
  expect(html.match(/http-equiv="Content-Security-Policy"/gi)).toHaveLength(1);

  await servePlayground(page);
  await page.goto(PLAYGROUND);
  const first = page.locator('head > :first-child');
  await expect(first).toHaveAttribute('http-equiv', 'Content-Security-Policy');
  await expect(first).toHaveAttribute('content', POLICY);
  await expect(first).toHaveAttribute('content', /(^|; )connect-src 'none'(;|$)/);
});

test('the browser refuses every connection the page could open, and reports each', async ({ page }) => {
  const log = await record(page);
  const violations = await watchViolations(page);
  await page.goto(PLAYGROUND);
  await settled(page);
  // Each channel is refused on the spot (some engines throw) or reported as a `connect-src` violation.
  const thrown = await page.evaluate(() => {
    const to = (kind: string) => new URL(`./leak-${kind}`, location.href).href;
    /* eslint-disable fhirq/no-network -- the connections the policy must refuse */
    const attempts: Record<string, () => unknown> = {
      fetch: () => fetch(to('fetch')).catch(() => undefined),
      xhr: () => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', to('xhr'));
        xhr.send('x');
      },
      beacon: () => navigator.sendBeacon(to('beacon'), 'x'),
      events: () => new EventSource(to('events')),
      socket: () => new WebSocket(to('socket').replace(/^http/, 'ws')),
    };
    /* eslint-enable fhirq/no-network */
    const refused: string[] = [];
    for (const [kind, attempt] of Object.entries(attempts)) {
      try {
        attempt();
      } catch {
        refused.push(kind);
      }
    }
    return refused;
  });
  const unrefused = async () => {
    const reported = (await violations()).filter((entry) => entry.startsWith('connect-src'));
    return ['fetch', 'xhr', 'beacon', 'events', 'socket'].filter((kind) => !thrown.includes(kind) && !reported.some((entry) => entry.includes(`leak-${kind}`)));
  };
  await expect.poll(unrefused).toEqual([]);
  // Chromium starts a request object for some before blocking it; none reaches the server.
  await page.waitForLoadState('networkidle');
  expect([...log.served.requests.map((request) => request.url), ...log.sockets].filter((url) => url.includes('leak-'))).toEqual([]);
});

test('makes only D4 requests across load, paste, answers and every tier, and breaks none of the policy (AC-5)', async ({ page }) => {
  const log = await record(page);
  const violations = await watchViolations(page);
  await page.goto(PLAYGROUND);
  await settled(page);
  const initial = log.requests.length;
  // Everything the build holds is in by now, the lazy chunks among them.
  expect(new Set(log.requests.map((request) => request.url.slice(PLAYGROUND.length)))).toEqual(built);

  // Answer the demo.
  await form(page).getByRole('radiogroup', { name: /Are you in pain today/ }).getByRole('radio', { name: 'Yes' }).check();

  // Paste a questionnaire carrying the sentinel, and answer it with the sentinel too.
  await editor(page).getByLabel('Questionnaire JSON').fill(pasted);
  await expect(editor(page).getByRole('status')).toContainText('Loaded');
  await form(page).getByLabel(/Something private/).fill(SENTINEL);
  await form(page).getByLabel(/Something private/).blur();
  await expect(page.getByRole('region', { name: 'The emitted QuestionnaireResponse', exact: true })).toContainText(SENTINEL);

  // Every tier, over the same session, and every scheme.
  const tiers = switcher(page).getByRole('group', { name: 'Tier' });
  for (const name of [/Tokens/, /Slots/, /Headless/, /Defaults/]) {
    await tiers.getByRole('radio', { name }).check();
    await expect(form(page).getByLabel(/Something private/)).toHaveValue(SENTINEL);
  }
  for (const name of ['Light', 'Dark', 'System']) await switcher(page).getByRole('radio', { name, exact: true }).check();

  // The samples, with the in-memory resolver.
  await editor(page).getByLabel('Sample').selectOption({ label: 'Value sets (option-resolution)' });
  await form(page).getByRole('radiogroup', { name: 'How do you take it?' }).getByRole('radio', { name: 'B' }).check();
  await page.waitForLoadState('networkidle');

  expect(log.sockets).toEqual([]);
  expect(log.requests.slice(initial), 'a request after the lazy chunks settled').toEqual([]);
  for (const request of log.requests) {
    expect(request.method, request.url).toBe('GET');
    expect(request.body, request.url).toBeNull();
    expect(request.url.startsWith(PLAYGROUND), request.url).toBe(true);
    expect(new URL(request.url).search, request.url).toBe('');
    expect(built.has(request.url.slice(PLAYGROUND.length)), request.url).toBe(true);
    expect(`${request.url} ${request.headers}`, request.url).not.toContain(SENTINEL);
  }
  expect(await violations()).toEqual([]);
});
