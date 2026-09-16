# ADR-0008 — Zero third-party runtime dependencies, enforced mechanically

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** Brief §3, §4, §6 principle 2 · US-14.1 (AC-14.1.1), AC-13.5.1, AC-14.5.1 · NFR-S-01, NFR-S-05, NFR-S-08, NFR-X-06, NFR-X-07, NFR-C-06 · `05-architecture.md` §8 A3 · NFR-M-05 topic *zero-dependency constraint*

## Context

The primary user is a team shipping patient-facing software under a quality system. Every third-party package in such a product has to be reviewed, justified and documented, and its transitive dependencies with it. For this buyer, a dependency count is an adoption cost measured in review hours, and a long transitive tree can block adoption outright (Brief §3). "Zero runtime dependencies" is one of the three claims the competitive position rests on (Brief §4).

Three points need settling before the claim can be enforced:

1. **What counts as a dependency.** Taken literally, NFR-S-01 ("0 direct") would forbid `@fhirq/react` from depending on `@fhirq/core`.
2. **Vendoring.** Copying third-party code into `dist/` gives an empty `dependencies` field while shipping the same review burden, now hidden from the SBOM.
3. **Compiler helpers.** TypeScript and bundlers can inject runtime helper packages such as `tslib`.

## Options considered

**A. Allow a small number of vetted dependencies** (for example a tiny event emitter or a focus-trap utility). Rejected. Each one restarts the buyer's review, and "small and vetted" is a judgement the buyer must repeat for every release. The claim stops being binary, and a binary claim is what makes it checkable in one glance.

**B. Zero declared dependencies, but bundle third-party code into `dist/`.** Rejected as dishonest. The review burden is unchanged, the code no longer appears in the SBOM (NFR-X-07), and vulnerability scanners cannot see it (NFR-X-06). An integrator who finds vendored code under a "zero dependencies" badge would rightly distrust every other claim in the README.

**C. Bundle each first-party package's internal dependencies into it** (for example `@fhirq/react` contains its own copy of core). Rejected. A host using both React components and the headless core would load two engines. Sessions created by one could not be passed to the other (`instanceof` and private-field checks fail across copies), and the host would pay twice in bytes.

**D. Zero third-party runtime dependencies; first-party packages depend on each other at exact versions and release in lockstep.** Chosen.

## Decision

- **Runtime `dependencies`** of every published package may contain only `@fhirq/*` packages, each pinned to the **exact** version being released. No ranges.
- **`peerDependencies`**: `react` (`>=18`) on `@fhirq/react` only (NFR-S-05). No other package declares peers.
- **Lockstep releases.** All four packages share one version number and are published together. A host never has to work out which `core` matches which `react`.
- **No vendored third-party code.** Nothing under any `node_modules/` path may reach a published bundle.
- **No injected helpers.** The compile target is ES2022 (NFR-C-06), so no downlevel helpers are needed; `importHelpers` stays off and `tslib` is banned.
- **NFR-S-01 interpretation.** "0 direct, 0 transitive" is read as *third-party* runtime dependencies. This is written in the README next to the badge, so the claim is stated precisely where it is made.

## Consequences

**Benefits**
- **The claim is binary and checkable in seconds:** `npm ls --omit=dev` for any `@fhirq/*` package shows only `@fhirq/*`.
- The SBOM for a host adopting the kit lists four packages from one publisher, with the same provenance attestation on each.
- One engine instance per page, however many layers a host uses.

**Costs accepted**
- **Everything is hand-written:** the keyed DOM patcher, the event emitter, the focus management, the date parsing within `Intl` limits, the value-set response parsing. Each one is code the maintainer owns and must test. This is the largest recurring cost of the constraint, and it is the constraint the buyer is paying for.
- **Lockstep versions release packages with no changes.** A fix to `@fhirq/element` bumps `@fhirq/themes`. The changelog notes "no changes" per package; the cost is noise, not risk.
- **No escape hatch for a hard problem.** If date or number input turns out to need a library, the options are to write the needed subset or to cut scope. Adding a dependency is not an option. This must be said plainly in the contributing guide, or the first outside PR will try it.

**Verification**
- A CI script (no dependencies of its own) reads every published `package.json` and fails if `dependencies` contains anything other than exact-pinned `@fhirq/*` at the workspace version, if `peerDependencies` exists anywhere other than `@fhirq/react`, or if `tslib` appears anywhere. The failure names the package (AC-14.1.1).
- The build writes an esbuild metafile per bundle. CI fails if any input path contains `node_modules/`, which catches vendoring even through a re-export.
- A packed-tarball check (`npm pack --dry-run`) asserts contents are `dist`, types, README, LICENSE and NOTICE only (NFR-S-08).
- The consumer smoke tests (NFR-C-02) install from packed tarballs into clean projects and run `npm ls --omit=dev`, asserting only `@fhirq/*` (and React where applicable) appear.
