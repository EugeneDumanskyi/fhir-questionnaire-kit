// webpack 5 through its Node API, so no CLI. Stylesheets go through webpack's
// own CSS support rather than a loader. The page is written from the entry's
// emitted files, as an HTML plugin would.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import webpack from 'webpack';

const dist = join(import.meta.dirname, 'dist');
const compiler = webpack({
  mode: 'production',
  context: import.meta.dirname,
  entry: './app.js',
  output: { path: dist, clean: true },
  experiments: { css: true },
  // React alone passes webpack's 244 KiB hint; the kit's own budgets are
  // gated where they are set (NFR-S-02).
  performance: false,
});

compiler.run((error, stats) => {
  compiler.close(() => {});
  if (error !== null || stats.hasErrors() || stats.hasWarnings()) {
    console.error(error ?? stats.toString('errors-warnings'));
    process.exit(1);
  }
  const assets = stats.toJson({ all: false, entrypoints: true }).entrypoints.main.assets.map(({ name }) => name);
  const tags = assets.map((name) => (name.endsWith('.css') ? `<link rel="stylesheet" href="${name}">` : `<script defer src="${name}"></script>`));
  writeFileSync(join(dist, 'index.html'), `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Consumer smoke: webpack</title>
    ${tags.join('\n    ')}
  </head>
  <body>
    <main id="react"></main>
    <aside id="element"></aside>
  </body>
</html>
`);
  console.log(`webpack ${webpack.version}: ${assets.join(', ')}`);
});
