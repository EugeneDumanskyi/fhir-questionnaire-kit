# ADR-0018 — Build and verification toolchain under the licence allowlist

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** E14 (AC-14.1.1, AC-14.2.1, AC-14.3.1–2, AC-14.4.1, AC-14.5.1, AC-14.6.1), AC-11.5.1, AC-13.2.1, AC-13.4.2 · NFR-S-02, NFR-S-06, NFR-S-07, NFR-S-08, NFR-C-02, NFR-C-05, NFR-Q-01–08, NFR-A-01, NFR-M-04, NFR-M-06, NFR-M-07, NFR-X-06, NFR-X-07, NFR-Z-01 · `05-architecture.md` §8 A6, §9 AT1

## Context

Most of what the NFRs promise is a CI gate. More than a dozen checks must block merges: types, lint, unit tests, integration, coverage, mutation, property-based round-trips, accessibility, CSP, bundle budgets, the dependency check, the API report, packed contents, consumer smoke tests in six environments, and site builds. The toolchain must deliver all of these within 10 minutes p95 (NFR-M-07), with ≤ 40 direct dev dependencies (NFR-S-06), all under an MIT, Apache-2.0, BSD, ISC or 0BSD licence (NFR-S-07), within a 40–60 hour build budget (NFR-Z-01).

Two conflicts surface once concrete tools are chosen:

1. **Accessibility tooling licence.** axe-core, the de facto engine for automated WCAG checks, and its Playwright integration are licensed MPL-2.0, which is not on the NFR-S-07 allowlist.
2. **Mutation testing time.** A full mutation run over the engine modules will not fit inside 10 minutes on a 2-core runner.

## Options considered

**Build tool**

- **A. Rollup with plugins.** Mature, fine-grained output control. Rejected: several plugins for TypeScript, minification and IIFE output add dev dependencies and configuration for no output the kit needs.
- **B. A higher-level library bundler** (tsup, tsdown or similar). Convenient, but rejected: each brings its own dependency tree and release cadence, and the kit's needs are simple enough not to justify it.
- **C. esbuild directly, plus `tsc` for declarations and API Extractor for declaration roll-up and the API report.** Chosen. One bundler dependency with no transitive runtime tree. It produces ESM, CJS and IIFE with a metafile that the dependency gate (ADR-0008) and budget gate both read.

**Automated accessibility engine**

- **D. axe-core via Playwright, after amending NFR-S-07 to allow MPL-2.0 for dev-only, never-distributed tools.** Chosen; the amendment was accepted on 2026-09-15 (AT1). MPL-2.0's obligations attach to distributing MPL-licensed files, and the kit distributes none: the tool runs in CI only, and nothing from it reaches a published package (NFR-S-08 already gates package contents). It has the largest rule set and the most familiar reports for a buyer's QA team.
- **E. IBM Equal Access Accessibility Checker (Apache-2.0).** Within the original allowlist and WCAG 2.2-aware. Kept as the documented fallback if axe-core becomes unusable. Its ecosystem is smaller, and its reports are less familiar to the buyer's QA teams.
- **F. No automated engine; manual checks only.** Rejected, because it fails NFR-A-01 and AC-11.5.1.

**Mutation testing in CI**

- **G. Full run on every PR.** Rejected: it breaks NFR-M-07.
- **H. Incremental run on PRs** (only mutants in changed engine files), **full run nightly and before release.** Chosen.

## Decision

| Concern | Tool | Licence |
|---|---|---|
| Workspace, installs | pnpm workspaces | MIT |
| Language, declarations | TypeScript (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | Apache-2.0 |
| Bundling (ESM, CJS, IIFE, metafile) | esbuild | MIT |
| Declaration roll-up, API report (NFR-M-04, NFR-U-05) | @microsoft/api-extractor | MIT |
| Unit and integration tests; Node-only core suite (NFR-C-04) | Vitest | MIT |
| Property-based tests (NFR-Q-06) | fast-check | MIT |
| Mutation testing (NFR-Q-03) | StrykerJS, incremental mode on PRs | Apache-2.0 |
| Browser tests: renderers, CSP, style isolation, SSR hydration | Playwright | Apache-2.0 |
| Automated accessibility (NFR-A-01) | axe-core via Playwright (allowed by amended NFR-S-07, AT1) | MPL-2.0, dev-only |
| Playground performance (NFR-P-06) | Lighthouse CI | Apache-2.0 |
| Lint and custom architectural rules (NFR-M-06) | ESLint + typescript-eslint, custom rules in-repo | MIT |
| Versioning, changelog, lockstep releases (ADR-0008) | Changesets (fixed mode) | MIT |
| SBOM (NFR-X-07) | @cyclonedx/cyclonedx-npm | Apache-2.0 |
| Bundle budgets, dependency gate, packed-contents gate, licence gate | In-repo Node scripts using the esbuild metafile and `node:zlib` | — |

**Pipeline shape** (GitHub Actions):
1. **Fast lane,** ≤ 3 minutes: install from cache, type-check, lint, core unit tests in Node.
2. **Parallel lanes** after the fast lane:
   - build + budgets + dependency, packed-contents and licence gates + API report diff;
   - renderer and browser tests (Chromium, Firefox, WebKit) + accessibility + CSP;
   - property tests + incremental mutation;
   - consumer smoke tests against packed tarballs (NFR-C-02);
   - playground and docs build + Lighthouse.
3. **Nightly and pre-release:** full mutation run, full property run at a higher case count, and the React 18/19 matrix on every environment. **A release is blocked if the nightly run on its commit is red.**

The licence gate reads each direct dev dependency's `license` field against the amended NFR-S-07 allowlist and fails naming the package. It accepts MPL-2.0 only in `devDependencies`.

## Consequences

**Benefits**
- **About 20 direct dev dependencies,** well inside NFR-S-06, every one a widely used tool with a permissive licence.
- **Custom gates are small scripts with no dependencies,** which adopters can read in minutes. They are part of the evidence, not a black box.
- **Every gate the NFRs list maps to a named lane,** so AC-14.4.1 can be checked against the workflow file.

**Costs accepted**
- **An MPL-2.0 tool in the toolchain.** The amended NFR-S-07 permits it because it is dev-only and nothing from it is distributed. Two gates enforce that boundary: the licence gate accepts MPL-2.0 in `devDependencies` only, and the packed-contents gate (NFR-S-08) keeps it out of every tarball. The README's accessibility section names the engine that produced the report.
- **Mutation gating on PRs is incremental,** so a change that weakens tests in an unchanged file is caught only nightly. NFR-Q-03 is therefore a merge gate on changed code and a release gate on all code (`05-architecture.md` §8 A6).
- **Hand-written gates must themselves be tested.** Each script has a fixture that must fail, such as a package with a third-party dependency or an over-budget bundle, and CI runs those fixtures.
- **Three browser engines** in the PR lane cost minutes. If NFR-M-07 is breached, WebKit moves to nightly first, because NFR-C-01's Safari floor is verified at release.

**Verification**
- The pipeline's own p95 wall-clock time is tracked from Actions run data. NFR-M-07 is a target, so it is reviewed monthly rather than gated.
- Negative fixtures for each in-repo gate (dependency, budget, packed contents, licence, API report) run in CI and must fail for the right reason.
- A PR template check links each PR to a story or ADR (NFR-M-08).

**Amendment note, accepted 2026-09-28 (`06-roadmap.md` M8 plan D3): a CSS linter.** M8's AC-3 asks for a stylelint rule to prove that `base.css` holds no literal colour or length and no physical-direction property (NFR-I-05). One row joins the Decision's table:

| Concern | Tool | Licence |
|---|---|---|
| CSS lint for the themes (NFR-I-05, ADR-0013's tokens-only rule) | stylelint, exact-pinned, built-in rules only | MIT |

It runs over `packages/themes/src/*.css` in `pnpm lint`, so in the fast lane. The config uses no plugin and no shared config, so it adds one direct dev dependency, and the count stays well inside NFR-S-06. Like every gate, it has fixtures that must fail. It replaces the Vitest regex checks over the stylesheets, which were a stand-in until now.

**Amendment note, accepted 2026-09-28 (`06-roadmap.md` M9 plan D1 and D10): the package build and Lighthouse CI.** Two rows of the Decision's table are made concrete:

- **Bundling.** `pnpm build` runs an in-repo esbuild script. It builds every JavaScript target that the packages' `exports` maps name, from the published entry points: ESM and CJS for core, react and themes. `tsc` still emits the declarations, and themes copies its CSS into `dist`. The element keeps `scripts/build-element.mjs`, ESM only (M7 D9). A test checks that every `exports` target exists after a build, so a map can no longer point at a file nothing builds.
- **Lighthouse CI.** `@lhci/cli` (Apache-2.0), exact-pinned, one direct dev dependency. It runs three times against the built playground with the default mobile preset (simulated slow 4G, 4× CPU slowdown). It asserts NFR-P-06's thresholds on the median, in a blocking `Playground gates` job, which is the pipeline shape's "playground and docs build + Lighthouse" lane for the playground. The docs join it in M10.

**Amendment note, accepted 2026-09-28 (`06-roadmap.md` M10 plan D1 and D5): the docs renderer and the SBOM's timing.** One row joins the Decision's table, and one row is brought forward:

| Concern | Tool | Licence |
|---|---|---|
| Markdown to HTML for the docs site (NFR-Q-08, ADR-0019) | marked, exact-pinned, driven by an in-repo Node script | MIT |

- **The docs renderer.** marked has no dependencies of its own, so it adds one direct dev dependency. A framework generator was rejected: it brings a client runtime and inline scripts that ADR-0019's `script-src 'self'` forbids, and many transitive packages.
- **The SBOM.** `@cyclonedx/cyclonedx-npm` lands in M10, not M11. CI generates the SBOM as an artifact so the adoption pack can link to it; M11 attaches it to releases. The tool expects npm's layout. If it cannot read the pnpm workspace within a 30-minute timebox, an in-repo script writes the CycloneDX JSON instead, which is simple while every package has zero runtime dependencies, and this note is amended to say so.

  *Outcome, 2026-10-02 (plan step 8):* the tool held, inside the timebox. Run in the workspace, `npm ls` rejects pnpm's workspace links. So [`scripts/sbom.mjs`](../../scripts/sbom.mjs) runs it over each package as packed for npm, with the `@fhirq` packages it depends on unpacked under its `node_modules`, and no npm error is ignored. Peers are omitted, and the output is reproducible. The tool's optional XML validator, `libxmljs2`, has its install script left off in `pnpm-workspace.yaml`: the SBOMs are JSON.

**Amendment note, 2026-10-02 (`06-roadmap.md` M10 plan step 9, the ADR audit): claims about other tools, made checkable.**
- **axe-core.** "The de facto engine", "the largest rule set" and "the most familiar reports" are claims about a market, and none was measured. What can be checked: Playwright's own accessibility-testing guide uses `@axe-core/playwright`, so the integration is the test runner's documented one, and axe-core tags each rule with the WCAG level it tests, so the gate runs exactly the A and AA rules of WCAG 2.0 to 2.2 (`tests/browser/axe.ts`). Option E is kept as the fallback on its licence alone, not on a comparison of ecosystems.
- **esbuild.** "No transitive runtime tree": its manifest declares no `dependencies`, only 26 `optionalDependencies`, each its own binary for one platform, of which an install takes one.
- **"About 20 direct dev dependencies."** The inventory in `docs/adoption.md`, generated and checked by `pnpm lint`, lists 28 by name at M10, inside NFR-S-06's 40.
- **Mutation time.** "A full run will not fit inside 10 minutes on a 2-core runner" was a forecast. It was measured instead: spike S2 and M2 read a full local run at 7–8 minutes over 1,465 mutants, the incremental lane at up to 8.7 minutes before it was split into five shards, and a runner of 4 cores (`06-roadmap.md` R7, `00-s2-mutation-cost.md`). The decision stands on the measurements.

**Amendment note, accepted 2026-10-05 (`06-roadmap.md` M11 plan D3, D4, D5, D6, D7, D9, D10 and D11): the consumer projects, the release workflow and what blocks a release.** The Decision stands. One row joins its table, and the pipeline shape's third item is made concrete:

| Concern | Tool | Licence |
|---|---|---|
| Changelog entries that link the merged PR (AC-14.5.1) | @changesets/changelog-github, exact-pinned, as Changesets' changelog module | MIT |

- **Consumer smoke projects (NFR-C-02).** Each environment is a standalone project under `tests/consumers/`, outside the pnpm workspace, with its own committed `package-lock.json`. It installs with `npm ci` and the packed tarballs, as an adopter's project would. Their bundlers and frameworks are therefore not direct dev dependencies of the kit. NFR-S-06's count and the licence gate cover the workspace's toolchain. The consumer projects' packages are listed with their licences when they are added, all within NFR-S-07's allowlist. They run in their own parallel lane on PRs, and as the full matrix nightly.
- **"The React 18/19 matrix on every environment"** reads as: on every environment where both majors can run. The Next.js App Router needs React 19, so that environment runs on 19 only, and Vite and webpack run on both.
- **The release workflow.** `release.yml` runs on a pushed `v*` tag. In order, it:
  1. checks the tag's signature against `.github/allowed_signers`, and that the tag is on `main`. The tag is signed by the maintainer, not created in CI, because a tag created in CI is unsigned (NFR-X-07);
  2. requires a `nightly.yml` run that succeeded on exactly the tagged commit. A missing run blocks the release just as a red one does;
  3. builds and packs once, then runs the dependency and packed-contents gates on those tarballs;
  4. runs the vulnerability audit and generates the SBOMs from the same tarballs;
  5. publishes those tarballs with npm provenance, so what was gated is what ships;
  6. creates the GitHub Release with the changelog section and the SBOMs attached;
  7. redeploys Pages from the tag (ADR-0019 note).
- **Nightly, as the release blocker.** As well as the full mutation run, it runs:
  - the property suites at 10× their PR counts through `FHIRQ_PROPERTY_RUNS`, or 5× if 10× does not fit the 60-minute timeout;
  - the consumer matrix;
  - `pnpm audit --audit-level high` (NFR-X-06).

  The audit does not run on PRs. An advisory published against an unchanged lockfile says nothing about the PR in hand, and the nightly sees it within a day.
