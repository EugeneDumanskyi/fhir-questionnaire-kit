import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Page as BrowserPage } from '@playwright/test';
import { build, transform, type Plugin } from 'esbuild';

import { ELEMENT_PAGES, ELEMENT_TYPED, HOST_STYLES, PAGES, TYPED, type ElementPage, type ElementTyped, type HostStyle, type Page, type Typed } from './names.js';

/**
 * Test pages for the S1 browser proofs, built in memory with esbuild and served
 * through `page.route`, so no server process is involved. Every page is on
 * one origin, and the element's page carries the strict CSP of NFR-C-07.
 */

export const ORIGIN = 'http://fhirq.test';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'";
export type Renderer = 'element' | 'react-19' | 'react-18';

/** What `/element-src.html` names, for the spec that opens it to serve: its form and its value-set base. */
export const SRC = { form: '/forms/coded.json', valueSetBase: '/fhir' } as const;

/** Where `examples/element-embed` is served, as it is on disk, with the script-tag build in place of the copy its README makes. */
export const EMBED = '/embed/';

/**
 * ADR-0020's pair, 26 hours apart: React pages are rendered on a server in
 * the first zone and hydrated in a browser in the second, so a date that
 * passed through either would land on another day and fail hydration.
 */
export const SERVER_ZONE = 'Pacific/Kiritimati';
export const CLIENT_ZONE = 'Etc/GMT+12';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const at = (path: string) => join(root, path);

const SOURCES: Readonly<Record<string, string>> = {
  '@fhirq/core': at('packages/core/src/index.ts'),
  '@fhirq/core/view': at('packages/core/src/view/index.ts'),
  '@fhirq/core/resume': at('packages/core/src/resume.ts'),
  '@fhirq/react': at('packages/react/src/index.ts'),
  '@fhirq/element': at('packages/element/src/index.ts'),
  '@fhirq/themes/base.css': at('packages/themes/src/base.css'),
  '@fhirq/themes/default.css': at('packages/themes/src/default.css'),
};

/** Workspace sources for `@fhirq/*`, one React major for `react*`, minified CSS as text. */
function resolver(major: 18 | 19 | null): Plugin {
  const react = createRequire(at(major === 18 ? 'tools/react-18/package.json' : 'packages/react/package.json'));
  return {
    name: 'fhirq-test-pages',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^@fhirq\// }, (args) => {
        const path = SOURCES[args.path];
        return path === undefined ? { errors: [{ text: `unknown ${args.path}` }] } : { path };
      });
      if (major !== null) {
        pluginBuild.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: react.resolve(args.path) }));
      }
      pluginBuild.onLoad({ filter: /\.css$/ }, async (args) => {
        const { code } = await transform(readFileSync(args.path, 'utf8'), { loader: 'css', minify: true });
        return { contents: code, loader: 'text' };
      });
    },
  };
}

async function bundle(entry: string, major: 18 | 19 | null, mode: 'development' | 'production' = 'development'): Promise<string> {
  const result = await build({
    entryPoints: [at(entry)],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    // Development builds, the ones that print hydration warnings, except
    // where a proof times what a host ships.
    define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
    plugins: [resolver(major)],
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

/** What the server rendered, and the UTC offset it rendered at, in minutes as `getTimezoneOffset` gives it. */
export interface Rendered {
  readonly offset: number;
  readonly pages: Readonly<Record<Page, string>>;
}

/** Prints the offset and every page's markup, as JSON, from a separate Node process. */
const RENDER = `const { render } = require(process.argv[1]);
const pages = Object.fromEntries(${JSON.stringify(PAGES)}.map((page) => [page, render(page)]));
process.stdout.write(JSON.stringify({ offset: new Date(Date.UTC(2024, 4, 1)).getTimezoneOffset(), pages }));`;

/**
 * Renders every page in its own Node process with `TZ` set to the server's
 * zone, the one way to hold a whole process in a zone. Anything the render
 * writes to the console fails the build, as it would in the browser.
 */
async function serverRender(major: 18 | 19): Promise<Rendered> {
  const result = await build({
    entryPoints: [at('tests/browser/pages/react-server.tsx')],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [resolver(major)],
    logLevel: 'silent',
  });
  const file = join(mkdtempSync(join(tmpdir(), 'fhirq-ssr-')), `react-${major}.cjs`);
  writeFileSync(file, result.outputFiles[0]?.text ?? '');
  const run = spawnSync(process.execPath, ['-e', RENDER, file], { env: { ...process.env, TZ: SERVER_ZONE }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0 || run.stderr !== '') throw new Error(`React ${major} server render: ${run.stderr || `exit ${String(run.status)}`}`);
  return JSON.parse(run.stdout) as Rendered;
}

/** Builds the element as `pnpm build:element` does, in memory, and prints the script-tag build. */
const IIFE = `const { buildElement } = await import(process.argv[1]);
const [, , iife] = await buildElement({ write: false });
process.stdout.write(iife.outputFiles[0].text);`;

/**
 * The script-tag build a host loads (M7 plan D9), from the build script
 * itself rather than a copy of its options, so the embed page runs what
 * ships. In its own Node process, as the script is plain JavaScript.
 */
function scriptTagBuild(): string {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', IIFE, pathToFileURL(at('scripts/build-element.mjs')).href], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (run.status !== 0 || run.stderr !== '') throw new Error(`The element's build: ${run.stderr || `exit ${String(run.status)}`}`);
  return run.stdout;
}

const html = (title: string, head: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1">` +
  `<meta name="color-scheme" content="light dark"><title>${title}</title>${head}</head>` +
  `<body><main>${body}</main></body></html>`;

interface Asset {
  readonly body: string;
  readonly type: string;
}

let assets: Promise<ReadonlyMap<string, Asset>> | undefined;

async function buildAssets(): Promise<ReadonlyMap<string, Asset>> {
  const js = (body: string): Asset => ({ body, type: 'text/javascript' });
  const page = (body: string): Asset => ({ body, type: 'text/html' });
  const css = (path: string): Asset => ({ body: readFileSync(at(path), 'utf8'), type: 'text/css' });
  const TYPES: Readonly<Record<string, string>> = { html: 'text/html', json: 'application/json', md: 'text/markdown' };
  const embed = readdirSync(at('examples/element-embed'))
    .filter((file) => file !== 'fhirq-element.js')
    .map((file): [string, Asset] => [
      `${EMBED}${file}`,
      { body: readFileSync(at(`examples/element-embed/${file}`), 'utf8'), type: TYPES[file.split('.').pop() ?? ''] ?? 'text/plain' },
    ]);
  const [element, elementSrc, elementTyped, react19, react18, typed19, typed18, ssr19, ssr18] = await Promise.all([
    bundle('tests/browser/pages/element-page.ts', null),
    bundle('tests/browser/pages/element-src.ts', null),
    bundle('tests/browser/pages/element-keystroke.ts', null, 'production'),
    bundle('tests/browser/pages/react-client.tsx', 19),
    bundle('tests/browser/pages/react-client.tsx', 18),
    bundle('tests/browser/pages/keystroke-page.tsx', 19, 'production'),
    bundle('tests/browser/pages/keystroke-page.tsx', 18, 'production'),
    rendered(19),
    rendered(18),
  ]);
  const reactPages = (major: 18 | 19, ssr: Rendered) =>
    PAGES.map((name): [string, Asset] => [
      `/${address(`react-${major}`, name)}.html`,
      page(
        html(
          `fhirq React ${major}`,
          '<link rel="stylesheet" href="/default.css"><link rel="stylesheet" href="/base.css">' +
            `<script type="module" src="/react-${major}.js"></script>`,
          `<div id="root" data-page="${name}">${ssr.pages[name]}</div>`,
        ),
      ),
    ]);
  const typedPages = (major: 18 | 19) =>
    TYPED.map((name): [string, Asset] => [
      `/keystroke-${major}-${name}.html`,
      page(
        html(
          `fhirq keystroke React ${major}`,
          '<link rel="stylesheet" href="/default.css"><link rel="stylesheet" href="/base.css">' +
            `<script type="module" src="/keystroke-${major}.js"></script>`,
          `<div id="root" data-page="${name}"></div>`,
        ),
      ),
    ]);
  return new Map<string, Asset>([
    ...ELEMENT_PAGES.map((name): [string, Asset] => [
      `/${address('element', name)}.html`,
      page(html('fhirq element', '<script type="module" src="/element.js"></script>', `<fhir-questionnaire data-page="${name}"></fhir-questionnaire>`)),
    ]),
    ['/element.js', js(element)],
    [
      `/${TWO}.html`,
      page(
        html(
          'fhirq element',
          '<script type="module" src="/element.js"></script>',
          '<fhir-questionnaire data-page="demo"></fhir-questionnaire><fhir-questionnaire data-page="demo"></fhir-questionnaire>',
        ),
      ),
    ],
    [
      '/element-src.html',
      page(
        html(
          'fhirq element',
          '<script type="module" src="/element-src.js"></script>',
          `<fhir-questionnaire src="${SRC.form}" value-set-base="${SRC.valueSetBase}"></fhir-questionnaire>`,
        ),
      ),
    ],
    ['/element-src.js', js(elementSrc)],
    ...embed,
    [`${EMBED}fhirq-element.js`, js(scriptTagBuild())],
    ...HOST_STYLES.flatMap((style) =>
      [true, false].map((withElement): [string, Asset] => [`/${isolation(style, withElement)}.html`, page(isolationPage(style, withElement))]),
    ),
    ...HOST_STYLES.map((style): [string, Asset] => [`/host/${style}.css`, css(`tests/browser/pages/host/${style}.css`)]),
    ...reactPages(19, ssr19),
    ['/react-19.js', js(react19)],
    ...reactPages(18, ssr18),
    ['/react-18.js', js(react18)],
    ...typedPages(19),
    ['/keystroke-19.js', js(typed19)],
    ...typedPages(18),
    ['/keystroke-18.js', js(typed18)],
    ...ELEMENT_TYPED.map((name): [string, Asset] => [
      `/keystroke-element-${name}.html`,
      page(html('fhirq keystroke element', '<script type="module" src="/keystroke-element.js"></script>', `<fhir-questionnaire data-page="${name}"></fhir-questionnaire>`)),
    ]),
    ['/keystroke-element.js', js(elementTyped)],
    ['/base.css', css('packages/themes/src/base.css')],
    ['/default.css', css('packages/themes/src/default.css')],
  ]);
}

/** The page of two elements on the demo, each with its own session (M7 step 9, AC-9). */
const TWO = 'element-two';

/** An isolation page's path. */
const isolation = (style: HostStyle, withElement: boolean) => `isolation-${style}-${withElement ? 'with' : 'without'}`;

/**
 * An isolation page: the host's own elements, then, when `withElement`,
 * the element on the demo inside a `div` of the host's (an ancestor for
 * tokens), placed by `clean.css`. The host's stylesheets are
 * `clean.css` and the variant's; the element's bundle is loaded either way,
 * so the only difference between the pair is the element in the page.
 */
const isolationPage = (style: HostStyle, withElement: boolean) =>
  html(
    'fhirq isolation',
    '<link rel="stylesheet" href="/host/clean.css">' +
      (style === 'clean' ? '' : `<link rel="stylesheet" href="/host/${style}.css">`) +
      '<script type="module" src="/element.js"></script>',
    '<div class="host" id="host"><h2>Host heading</h2><p>Host text with <a href="#host">a link</a>.</p>' +
      '<label for="host-input">Host field</label><input id="host-input" type="text">' +
      '<select aria-label="Host menu"><option>One</option></select><button type="button">Host button</button></div>' +
      `<div class="host-frame">${withElement ? '<fhir-questionnaire data-page="demo"></fhir-questionnaire>' : ''}</div>`,
  );

/** A page's path: the renderer's own for the slice, suffixed by the form otherwise. */
const address = (renderer: Renderer, form: Page | ElementPage) => (form === 'slice' ? renderer : `${renderer}-${form}`);

const renders = new Map<18 | 19, Promise<Rendered>>();

/** The server's markup for every page, rendered once per run, for proofs that compare it with the hydrated DOM. */
export function rendered(major: 18 | 19): Promise<Rendered> {
  const cached = renders.get(major) ?? serverRender(major);
  renders.set(major, cached);
  return cached;
}

/** Routes the test origin to the in-memory pages. Every response carries the strict CSP. */
export async function serve(page: BrowserPage): Promise<void> {
  assets ??= buildAssets();
  const files = await assets;
  await page.route(`${ORIGIN}/**`, async (route) => {
    // A directory is its index, as a static server serves it.
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '/index.html');
    const asset = files.get(path);
    if (asset === undefined) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: asset.type,
      headers: { 'Content-Security-Policy': CSP },
      body: asset.body,
    });
  });
}

/** Opens a renderer's page, the slice unless another form is named, and waits until it is interactive. */
export async function open(page: BrowserPage, renderer: Renderer, form: Page | ElementPage = 'slice'): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}/${address(renderer, form)}.html`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}

/** Opens the page of two elements on the demo and waits until both are interactive. */
export async function openTwo(page: BrowserPage): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}/${TWO}.html`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}

/** Opens an isolation page and waits until it is interactive. */
export async function openIsolation(page: BrowserPage, style: HostStyle, withElement: boolean): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}/${isolation(style, withElement)}.html`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}

/** Opens a keystroke page, a production build rendered on the client only, and waits for its first commit. */
export async function openTyped(page: BrowserPage, major: 18 | 19, form: Typed): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}/keystroke-${major}-${form}.html`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}

/** Opens an element keystroke page, a production build, and waits until the element has its session. */
export async function openElementTyped(page: BrowserPage, form: ElementTyped): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}/keystroke-element-${form}.html`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}

/** The form's three states the proofs run in. Driven the way a respondent and host would. */
export type FormState = 'initial' | 'string-shown' | 'errors-surfaced';

export async function reach(page: BrowserPage, state: FormState): Promise<void> {
  if (state === 'initial') return;
  await page.getByRole('radio', { name: 'Yes' }).check();
  await page.getByRole('textbox').waitFor();
  if (state === 'string-shown') return;
  await page.evaluate(() => {
    const { session } = (window as unknown as { fhirq: { session: { dispatch(command: { type: string }): unknown } } }).fhirq;
    session.dispatch({ type: 'RequestCompletion' });
  });
  await page.getByRole('region', { name: 'There is a problem' }).waitFor();
}
