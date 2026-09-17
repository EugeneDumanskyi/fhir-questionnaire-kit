import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { build, transform, type Plugin } from 'esbuild';

/**
 * Test pages for the S1 browser proofs, built in memory with esbuild and served
 * through `page.route`, so no server process is involved. Every page is on
 * one origin, and the element's page carries the strict CSP of NFR-C-07.
 */

export const ORIGIN = 'http://fhirq.test';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'";
export type Renderer = 'element' | 'react-19' | 'react-18';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const at = (path: string) => join(root, path);

const SOURCES: Readonly<Record<string, string>> = {
  '@fhirq/core': at('packages/core/src/index.ts'),
  '@fhirq/core/view': at('packages/core/src/view/index.ts'),
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

async function bundle(entry: string, major: 18 | 19 | null): Promise<string> {
  const result = await build({
    entryPoints: [at(entry)],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    // Development builds: they are the ones that print hydration warnings.
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [resolver(major)],
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

async function serverRender(major: 18 | 19): Promise<string> {
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
  const { render } = createRequire(import.meta.url)(file) as { render: () => string };
  return render();
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
  const [element, react19, react18, ssr19, ssr18] = await Promise.all([
    bundle('tests/browser/pages/element-page.ts', null),
    bundle('tests/browser/pages/react-client.tsx', 19),
    bundle('tests/browser/pages/react-client.tsx', 18),
    serverRender(19),
    serverRender(18),
  ]);
  const reactPage = (major: 18 | 19, ssr: string) =>
    page(
      html(
        `fhirq React ${major}`,
        '<link rel="stylesheet" href="/default.css"><link rel="stylesheet" href="/base.css">' +
          `<script type="module" src="/react-${major}.js"></script>`,
        `<div id="root">${ssr}</div>`,
      ),
    );
  return new Map<string, Asset>([
    ['/element.html', page(html('fhirq element', '<script type="module" src="/element.js"></script>', '<fhir-questionnaire></fhir-questionnaire>'))],
    ['/element.js', js(element)],
    ['/react-19.html', reactPage(19, ssr19)],
    ['/react-19.js', js(react19)],
    ['/react-18.html', reactPage(18, ssr18)],
    ['/react-18.js', js(react18)],
    ['/base.css', css('packages/themes/src/base.css')],
    ['/default.css', css('packages/themes/src/default.css')],
  ]);
}

/** The server-rendered markup, for assertions that compare it with the hydrated DOM. */
export async function ssrMarkup(major: 18 | 19): Promise<string> {
  return serverRender(major);
}

/** Routes the test origin to the in-memory pages. Every response carries the strict CSP. */
export async function serve(page: Page): Promise<void> {
  assets ??= buildAssets();
  const files = await assets;
  await page.route(`${ORIGIN}/**`, async (route) => {
    const asset = files.get(new URL(route.request().url()).pathname);
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

/** Opens a renderer's page and waits until it is interactive. */
export async function open(page: Page, renderer: Renderer): Promise<void> {
  await serve(page);
  await page.goto(`${ORIGIN}/${renderer}.html`);
  await page.waitForFunction(() => (window as { fhirq?: { ready: boolean } }).fhirq?.ready === true);
}

/** The form's three states the proofs run in. Driven the way a respondent and host would. */
export type FormState = 'initial' | 'string-shown' | 'errors-surfaced';

export async function reach(page: Page, state: FormState): Promise<void> {
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
