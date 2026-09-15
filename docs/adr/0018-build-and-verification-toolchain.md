# ADR-0018 — Build and verification toolchain under the licence allowlist

- **Status:** Proposed
- **Date:** 2026-09-15
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
