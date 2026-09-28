/**
 * The pages the manual screen-reader passes run on (NFR-A-02, M8 plan step
 * 10, `docs/accessibility.md`): the demo and the form of every kind, in each
 * renderer, in the default theme, each inside a host form whose submit button
 * asks it to complete. Production builds from the workspace sources, under
 * the CSP a host sets, written as static files to be served where the
 * screen readers' machines can reach them:
 *
 *   node scripts/a11y-pages.mjs [--out dir]
 *   python3 -m http.server --bind 0.0.0.0 --directory reports/a11y/pages 8000
 *
 * `tests/browser/pass-pages.spec.ts` writes them the same way and opens each
 * in every engine.
 */

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { PRODUCTION, workspacePlugin } from './measure-bundles.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'";

/** Each page, by file name: its renderer and form (`tests/browser/pages/names.ts`'s `MATRIX_FORMS`). */
export const PAGES = {
  'element-demo.html': { renderer: 'element', form: 'demo' },
  'element-kinds.html': { renderer: 'element', form: 'kinds' },
  'react-demo.html': { renderer: 'react', form: 'demo' },
  'react-kinds.html': { renderer: 'react', form: 'kinds' },
};

/** The host's own chrome: its submit button a primary control, as NFR-A-05 asks of the kit's. */
export const HOST_CSS = `main { max-inline-size: 48rem; margin-inline: auto; padding: 1rem }
form > button { min-block-size: 2.75rem; min-inline-size: 2.75rem; margin-block-start: 1.5rem; padding-inline: 1.5rem; font: inherit }
`;

const RENDERER = { element: 'the element', react: 'React' };
const FORM = { demo: 'the demo', kinds: 'the form of every kind' };

/** React as `@fhirq/react` installs it. */
const react = createRequire(join(root, 'packages/react/package.json'));
const reactPlugin = {
  name: 'fhirq-pass-react',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: react.resolve(args.path) }));
  },
};

async function bundle(entry) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: true,
    jsx: 'automatic',
    define: PRODUCTION,
    loader: { '.css': 'text' },
    legalComments: 'none',
    plugins: [workspacePlugin(), reactPlugin],
    logLevel: 'silent',
  });
  return result.outputFiles[0]?.text ?? '';
}

export const document = (title, head, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${title}</title>
${head}
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

/** A page's markup: a heading naming it, a way back to the list, and the form in a host form. */
export function page({ renderer, form }) {
  const title = `${RENDERER[renderer]}, ${FORM[form]}`;
  const heading = `<h1>fhirq: ${title}</h1>\n<p><a href="./">All pages</a></p>`;
  if (renderer === 'element')
    return document(
      `fhirq pass: ${title}`,
      '<link rel="stylesheet" href="pass.css">\n<script type="module" src="pass-element.js"></script>',
      `${heading}\n<form>\n<fhir-questionnaire data-form="${form}"></fhir-questionnaire>\n<button>Submit</button>\n</form>`,
    );
  return document(
    `fhirq pass: ${title}`,
    '<link rel="stylesheet" href="base.css">\n<link rel="stylesheet" href="default.css">\n<link rel="stylesheet" href="pass.css">\n<script type="module" src="pass-react.js"></script>',
    `${heading}\n<div id="root" data-form="${form}"></div>`,
  );
}

export const index = () =>
  document(
    'fhirq screen-reader pass pages',
    '<link rel="stylesheet" href="pass.css">',
    `<h1>fhirq screen-reader pass pages</h1>\n<p>The script is in docs/accessibility.md.</p>\n<ul>\n${Object.entries(PAGES)
      .map(([file, cell]) => `<li><a href="${file}">${RENDERER[cell.renderer]}, ${FORM[cell.form]}</a></li>`)
      .join('\n')}\n</ul>`,
  );

/** Writes every page, both scripts, the host's stylesheet and the theme to `out`. */
export async function writePages(out) {
  const [element, reactPage] = await Promise.all([bundle('tests/browser/pages/pass-element.ts'), bundle('tests/browser/pages/pass-react.tsx')]);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), index());
  for (const [file, cell] of Object.entries(PAGES)) writeFileSync(join(out, file), page(cell));
  writeFileSync(join(out, 'pass-element.js'), element);
  writeFileSync(join(out, 'pass-react.js'), reactPage);
  writeFileSync(join(out, 'pass.css'), HOST_CSS);
  for (const sheet of ['base.css', 'default.css']) copyFileSync(join(root, 'packages/themes/src', sheet), join(out, sheet));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(root, 'reports/a11y/pages');
  await writePages(out);
  console.log(`${Object.keys(PAGES).length} pages: ${join(out, 'index.html')}`);
}
