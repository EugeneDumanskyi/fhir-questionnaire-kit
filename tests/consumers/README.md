# Consumer smoke projects

Each directory here is a project as an adopter writes it, built on the
packages as npm would deliver them (NFR-C-02, NFR-C-03; ADR-0018's M11
note). None is part of the pnpm workspace. Each has its own committed
`package-lock.json`, and none names `@fhirq/*`: the runner installs the
packed tarballs on top.

| Project | What it proves |
|---|---|
| `node` | Node, ESM (`esm.mjs`) and CommonJS (`cjs.cjs`): the engine, the view, resume, a React server render and the themes' files |
| `types` | TypeScript, with `skipLibCheck` off: `node16` resolution for an ES module and a CommonJS one, and `bundler` resolution for a React app with the element |
| `vite-react18`, `vite-react19` | A production Vite build of [`shared/app.js`](shared/app.js): the React form with the themes, and the element through `@fhirq/element/define` |
| `webpack-react18`, `webpack-react19` | The same app through webpack 5's Node API, its stylesheets through webpack's own CSS support ([`shared/webpack.mjs`](shared/webpack.mjs)) |
| `next` | The Next.js App Router on React 19, built and served: the engine in a server component and the form in a client one |
| `script-tag` | A plain page, under a strict CSP, with the element's script-tag build from the packed tarball |

The demonstration form (`fixtures/demo/questionnaire.json`) is copied into
each project as `questionnaire.json`. Every page must render it in Chromium,
take an answer and show the question that answer enables, with no page error.

## Running them

From the repository root:

```sh
pnpm build
pnpm consumers                          # pack, then every project
node scripts/consumers.mjs next types   # some projects, on the tarballs already packed
```

[`scripts/consumers.mjs`](../../scripts/consumers.mjs) copies each project to
a scratch directory outside the repository, so nothing resolves through the
workspace's `node_modules`. It installs with `npm ci --ignore-scripts`, adds
the tarballs and checks that each `@fhirq` package came from one. Then it runs
the project's steps and, for a page, checks it in Chromium. A failure names
the project and the step.

CI runs every project on Node 22 and the `node` project again on 24, in the
`Consumer smoke` job.

## Changing a project's dependencies

Edit its `package.json`, then rewrite its lockfile:

```sh
node scripts/consumers.mjs --update next
```

The licence gate (`pnpm lint`) reads each project's direct dependencies from
its lockfile, against NFR-S-07's allowlist. Their own dependencies are not
gated, as for the workspace's tools. Some carry other licences (Next.js's
optional image library, LGPL-3.0-or-later; Vite's CSS parser, MPL-2.0;
browser data, CC-BY-4.0). They run only here and nothing published contains
them. The Next.js project serves no images, so the image library is never
loaded.
