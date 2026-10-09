/**
 * The consumer smoke tests (NFR-C-02, NFR-C-03, M11 AC-1; plan D3, D4 and
 * step 5).
 *
 * Each environment is a standalone project in `tests/consumers/<name>/`,
 * outside the pnpm workspace, with its own committed `package-lock.json`. For
 * each one this:
 *
 * 1. copies the project into a scratch directory outside the repository, so
 *    nothing resolves through the workspace's `node_modules`, with the
 *    demonstration form as `questionnaire.json` and any shared files;
 * 2. installs it with `npm ci`, then the packed tarballs `scripts/pack.mjs`
 *    wrote, without saving them, and checks each `@fhirq` package came from
 *    its tarball;
 * 3. runs its steps: typecheck, build or execute;
 * 4. for a browser environment, serves the build (or starts the server) and,
 *    in Chromium, checks each form renders, takes an answer and shows its
 *    conditional question, with no page error.
 *
 * Lifecycle scripts never run (`--ignore-scripts`), as in the workspace.
 *
 *   pnpm build && node scripts/pack.mjs && node scripts/consumers.mjs [name…]    exit 1 naming each failing environment and step
 *   node scripts/consumers.mjs --update [name…]    rewrite each project's package-lock.json from its package.json
 */

import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, get as request } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { TARBALLS } from './pack.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The projects' directory, and the form each one renders. */
export const CONSUMERS = join(root, 'tests', 'consumers');
const QUESTIONNAIRE = join(root, 'fixtures', 'demo', 'questionnaire.json');

const ALL = ['@fhirq/core', '@fhirq/react', '@fhirq/element', '@fhirq/themes'];
const tsc = (config) => ['node', 'node_modules/typescript/bin/tsc', '-p', config];
const next = (...args) => ['node', 'node_modules/next/dist/bin/next', ...args];
const vite = ['node', 'node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'];

/**
 * Every environment: its packages, the shared files copied in (source →
 * name), its steps (each a label and a command), and the page it serves, if
 * any. A page is `serve`d from a
 * directory or `start`ed with `{port}` filled in; `forms` are the selectors of
 * the forms on it, `themed` whether it loads the kit's stylesheets, and
 * `html` text the server's own HTML must hold.
 */
export const ENVIRONMENTS = [
  { name: 'node', packages: ALL, steps: [['esm', ['node', 'esm.mjs']], ['cjs', ['node', 'cjs.cjs']]] },
  { name: 'types', packages: ALL, steps: [['tsc node16', tsc('tsconfig.node16.json')], ['tsc bundler', tsc('tsconfig.bundler.json')]] },
  ...['vite-react18', 'vite-react19'].map((name) => ({
    name,
    packages: ALL,
    shared: { 'app.js': 'app.js', 'vite.html': 'index.html' },
    steps: [['vite build', vite]],
    page: { serve: 'dist', forms: ['#react', 'fhir-questionnaire'], themed: true },
  })),
  ...['webpack-react18', 'webpack-react19'].map((name) => ({
    name,
    packages: ALL,
    shared: { 'app.js': 'app.js', 'webpack.mjs': 'build.mjs' },
    steps: [['webpack', ['node', 'build.mjs']]],
    page: { serve: 'dist', forms: ['#react', 'fhir-questionnaire'], themed: true },
  })),
  {
    name: 'next',
    packages: ['@fhirq/core', '@fhirq/react', '@fhirq/themes'],
    steps: [['next build', next('build')]],
    page: { start: next('start', '--port', '{port}'), forms: ['#react'], themed: true, html: ['QuestionnaireResponse in-progress', 'Are you in pain today?'] },
  },
  {
    name: 'script-tag',
    packages: ['@fhirq/core', '@fhirq/element'],
    steps: [['copy', ['node', '-e', "require('node:fs').copyFileSync('node_modules/@fhirq/element/dist/fhirq-element.js', 'fhirq-element.js')"]]],
    page: { serve: '.', forms: ['fhir-questionnaire'], themed: false },
  },
];

/** The tarballs in `dir`, by package name, each with its version: `fhirq-core-1.0.0.tgz` is `@fhirq/core` at 1.0.0. */
export function tarballs(dir = TARBALLS) {
  if (!existsSync(dir)) throw new Error(`${dir}: no tarballs; run pnpm build && node scripts/pack.mjs first`);
  return new Map(
    readdirSync(dir)
      .map((file) => /^fhirq-(.+)-(\d+\.\d+\.\d+.*)\.tgz$/.exec(file))
      .filter((match) => match !== null)
      .map(([file, stem, version]) => [`@fhirq/${stem}`, { path: join(dir, file), version }]),
  );
}

/** Runs a command in `cwd`; throws with its output when it fails. */
function run([command, ...args], cwd, env = {}) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env } });
  } catch (error) {
    throw new Error(`${[command, ...args].join(' ')}\n${`${error.stdout ?? ''}${error.stderr ?? ''}`.trim() || error.message}`, { cause: error });
  }
}

/** `npm ci`, tried twice: a registry hiccup is not a failing consumer. */
function install(cwd) {
  const command = ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'];
  try {
    run(command, cwd);
  } catch {
    run(command, cwd);
  }
}

/** Copies project `name` from `base` into a fresh `work` directory, with the form and its shared files. */
function stage({ name, shared = {} }, base, work) {
  rmSync(work, { recursive: true, force: true });
  cpSync(join(base, name), work, { recursive: true, filter: (path) => !/[\\/](node_modules|dist|\.next)$/.test(path) });
  copyFileSync(QUESTIONNAIRE, join(work, 'questionnaire.json'));
  for (const [from, to] of Object.entries(shared)) copyFileSync(join(base, 'shared', from), join(work, to));
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** Serves `dir` on a free local port until `close()`d. */
export async function serve(dir) {
  const server = createServer((request, response) => {
    const path = resolve(dir, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    const file = path.endsWith(sep) || path === resolve(dir) ? join(path, 'index.html') : path;
    if (!file.startsWith(resolve(dir)) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) };
}

/** GETs `url` from a local server: resolves with its status and body, or with status 0 when nothing answers. */
export function get(url) {
  return new Promise((done) => {
    request(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => (body += chunk));
      response.on('end', () => done({ status: response.statusCode, body }));
    }).on('error', () => done({ status: 0, body: '' }));
  });
}

/** Starts `command` in `cwd` on a free port and waits until it answers; `close()` stops it. */
async function start(command, cwd) {
  const probe = await serve(cwd);
  const port = new URL(probe.origin).port;
  await probe.close();
  const [program, ...args] = command.map((part) => part.replace('{port}', port));
  const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const origin = `http://127.0.0.1:${port}`;
  const close = () => new Promise((done) => (child.exitCode === null ? (child.once('exit', done), child.kill()) : done()));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${command.join(' ')} exited ${child.exitCode}\n${output.trim()}`);
    if ((await get(origin)).status !== 0) return { origin, close };
    await delay(250);
  }
  await close();
  throw new Error(`${command.join(' ')} did not answer within 30 s\n${output.trim()}`);
}

/** The demonstration form's first question, and the question it enables. */
const PAIN = 'Are you in pain today?';
const SCORE = /how strong is it\?$/;

/** Opens the page at `origin` in Chromium and checks each form on it; throws naming the first that fails. */
async function exercise(origin, { forms, themed }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    await page.goto(origin);
    for (const selector of forms) {
      const form = page.locator(selector);
      const pain = form.getByRole('radiogroup', { name: PAIN });
      const score = form.getByRole('textbox', { name: SCORE });
      try {
        await pain.waitFor({ timeout: 15_000 });
        if ((await score.count()) !== 0) throw new Error('the conditional question shows before it is enabled');
        await pain.getByRole('radio', { name: 'Yes' }).check();
        await score.waitFor({ timeout: 5_000 });
      } catch (error) {
        throw new Error(`${selector}: ${error.message.split('\n')[0]}`, { cause: error });
      }
    }
    if (themed) {
      const tokens = await page.evaluate(() => [...globalThis.document.styleSheets].some((sheet) => [...sheet.cssRules].some((rule) => rule.cssText.includes('--fhirq-'))));
      if (!tokens) throw new Error('no stylesheet on the page sets a --fhirq-* token: the themes did not load');
    }
    if (errors.length > 0) throw new Error(`page errors:\n${errors.join('\n')}`);
  } finally {
    await browser.close();
  }
}

/**
 * Runs environment `env` from `base` in `work`, with the packed `packages`
 * (from `tarballs()`); resolves with each phase's seconds. Throws an error
 * whose message names the phase that failed.
 */
export async function smoke(env, { packages = tarballs(), base = CONSUMERS, work = join(tmpdir(), 'fhirq-consumers', env.name) } = {}) {
  const timings = {};
  const phase = async (label, body) => {
    const started = performance.now();
    try {
      await body();
    } catch (error) {
      throw new Error(`${label}: ${error.message}`, { cause: error });
    }
    timings[label] = (performance.now() - started) / 1000;
  };
  await phase('install', () => {
    stage(env, base, work);
    install(work);
    const missing = env.packages.filter((name) => !packages.has(name));
    if (missing.length > 0) throw new Error(`no tarball for ${missing.join(', ')}`);
    run(['npm', 'install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', ...env.packages.map((name) => packages.get(name).path)], work);
    for (const name of env.packages) {
      const manifest = join(work, 'node_modules', ...name.split('/'), 'package.json');
      const installed = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : 'nothing';
      if (installed !== packages.get(name).version) throw new Error(`${name}: installed ${installed}, not the tarball's ${packages.get(name).version}`);
    }
  });
  for (const [label, command] of env.steps) await phase(label, () => run(command, work));
  if (env.page !== undefined) {
    await phase('page', async () => {
      const server = env.page.start === undefined ? await serve(join(work, env.page.serve)) : await start(env.page.start, work);
      try {
        if (env.page.html !== undefined) {
          const { body: html } = await get(server.origin);
          const absent = env.page.html.filter((text) => !html.includes(text));
          if (absent.length > 0) throw new Error(`the server's HTML lacks ${absent.map((text) => JSON.stringify(text)).join(', ')}`);
        }
        await exercise(server.origin, env.page);
      } finally {
        await server.close();
      }
    });
  }
  return timings;
}

/** Rewrites environment `env`'s `package-lock.json` in `base` from its `package.json`. */
export function update(env, { base = CONSUMERS, work = join(tmpdir(), 'fhirq-consumers', env.name) } = {}) {
  stage(env, base, work);
  rmSync(join(work, 'package-lock.json'), { force: true });
  run(['npm', 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], work);
  copyFileSync(join(work, 'package-lock.json'), join(base, env.name, 'package-lock.json'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const names = args.filter((arg) => !arg.startsWith('--'));
  const unknown = names.filter((name) => !ENVIRONMENTS.some((env) => env.name === name));
  if (unknown.length > 0) {
    console.error(`unknown environment: ${unknown.join(', ')}; one of ${ENVIRONMENTS.map(({ name }) => name).join(', ')}`);
    process.exit(2);
  }
  const chosen = ENVIRONMENTS.filter((env) => names.length === 0 || names.includes(env.name));
  if (args.includes('--update')) {
    for (const env of chosen) {
      update(env);
      console.log(`${env.name}: package-lock.json rewritten`);
    }
    process.exit(0);
  }
  mkdirSync(join(tmpdir(), 'fhirq-consumers'), { recursive: true });
  const packages = tarballs();
  const failed = [];
  for (const env of chosen) {
    try {
      const timings = await smoke(env, { packages });
      const total = Object.values(timings).reduce((sum, seconds) => sum + seconds, 0);
      console.log(`ok   ${env.name.padEnd(16)} ${total.toFixed(1).padStart(5)} s  (${Object.entries(timings).map(([label, seconds]) => `${label} ${seconds.toFixed(1)}`).join(', ')})`);
    } catch (error) {
      failed.push(env.name);
      console.error(`FAIL ${env.name}: ${error.message}`);
    }
  }
  if (failed.length > 0) {
    console.error(`consumers: ${failed.length} of ${chosen.length} failed (${failed.join(', ')}), on node ${process.version}`);
    process.exit(1);
  }
  console.log(`consumers: ${chosen.length} of ${chosen.length} green, on node ${process.version}`);
}
