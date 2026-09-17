# ADR-0021 — Resume code ships as its own core entry point, and the element budget is held by ranked, measured reductions

- **Status:** Accepted 2026-09-17
- **Date:** 2026-09-17
- **Traces to:** Brief §3 secondary user, §4 · AC-09.1.1, AC-05.3.1–3, AC-06.1.1–5, AC-08.1.2 · NFR-S-02, NFR-S-03, NFR-S-04, NFR-C-07, NFR-U-05, NFR-M-04, NFR-M-06 · ADR-0007, ADR-0008, ADR-0010, ADR-0014, ADR-0015 · `03-nfr.md` §2 (S1 budget verdict and its tripwire) · `05-architecture.md` §4.1, §9 AT2 · `06-roadmap.md` §1 R1, M3, M5, M7 · `00-s1-architecture-and-bytes.md` §3

## Context

`03-nfr.md` §2 kept every NFR-S-02 figure on 2026-09-17, with R1 open, and set a tripwire. If a gate's first reading, scaled by the share of its layer's scope still to build, puts the element's central estimate over 24 kB, this ADR is drafted before the next milestone starts. Core's gate read first, at the end of M2, and the reading trips it.

**What is measured.** `@fhirq/core` is **28.8 kB minified and 10.16 kB gzipped**, inside its 14 kB budget. It is 1,990 source lines, excluding `view/`. That is already S1 method (b)'s *low* estimate for the whole core (1,980–3,340 lines), and it minifies at 14.5 bytes per line, against the slice's 12.4. The difference is the density S1 §3.5 predicted: a lenient branch for each load finding, and one diagnostic code per invariant. The element, built today from the real engine plus the spike's view, renderer and theme, is 41.1 kB minified and 14.17 kB gzipped.

**What is still to build in core** (M3 and M4): validation rules, the cross-field runner and surfacing; emission; snapshot, restore, decode and hydration with drift, orphans and quarantine (`04-domain.md` §8); option resolution; port wiring. Estimated at **1,000–2,000 lines, or 14.5–29.0 kB minified**. Of that, the resume path (decode, hydrate, snapshot, restore) is judged to be about 40 %: 5.8–11.6 kB. The share is a judgement. The consequences below are given at 25 % and 50 % as well.

**The projection**, in S1's arithmetic. The low bound is low bytes at the low ratio; the centre is the midpoint of the bytes at the midpoint ratio. The view, renderer and theme ranges are S1's, unchanged. Above 60 kB minified, the gzip ratio is 0.22–0.31.

| Estimate | Core, gzip | Element, method (a) view and renderer | Element, method (b) view and renderer |
|---|---:|---:|---:|
| Everything in one core entry point | 10.8–19.7 kB, centre **14.9** | 16.5–35.2 kB, centre **24.9** | 19.2–40.6 kB, centre **28.9** |
| Resume code out of the main entry point and the element (40 % share) | 9.4–15.7 kB, centre **12.3** | 15.2–31.6 kB, centre **22.6** | 17.9–37.0 kB, centre **26.6** |
| … at a 25 % share / 50 % share | centre 13.3 / 11.7 | centre 23.5 / 22.1 | centre 27.5 / 26.0 |

Both methods now put the element's central estimate over 24 kB with core as a single entry point. Core's own centre is also over its 14 kB budget.

**The constraint that makes this hard** is that the element's 24 kB covers three things at once (NFR-S-02). The first is the whole engine the element reaches. The second is the full view model. The third is a stylesheet embedded as strings, which is how ADR-0014 meets both one-script-tag installation (AC-09.1.1) and `style-src 'self'` (NFR-C-07). Every reduction touches one of those three promises: a number, the engine's scope, or the embed.

**What is open** is how that budget is held, in what order the reductions are spent, and when each is decided. The tripwire exists so this is settled while M3 can still shape core's module structure. M7, the milestone with the least room (R1), is too late.

## Options considered

**A. Amend NFR-S-02 now:** element to about 30 kB, core to about 18 kB, IIFE to match. Rejected. Every figure measured today is inside its budget; only the projections are over. The projections have error bands three times wide at the top edge. Amending on them replaces one assumption with another, which is the failure mode `03-nfr.md` §2 names. An adopter who read "24 kB" would see it raised before any code had exceeded it.

**B. Stop embedding the theme** (the option ADR-0014 and NFR-S-02 name). The element loads `base.css` and a preset through `<link rel="stylesheet">`, and its budget excludes them. The saving is −2.5 to −5.1 kB gzipped (S1 §3.6). Rejected for v1. It re-opens ADR-0014's option C, which was rejected for reasons that still hold:
- the embedder must host a second file, so AC-09.1.1's single script tag fails;
- a CDN-hosted sheet is cross-origin and fails `style-src 'self'` (NFR-C-07);
- the form renders unstyled until the sheet arrives.

It trades two acceptance criteria that a script-tag embedder checks on day one for a number the same embedder reads once.

**C. Narrow the spec surface** (cut ladder). Rejected. Scope reductions are product decisions: the cut ladder was declined in writing (R3), and every candidate is a `Must` that an evaluator reads in the conformance matrix. Bytes alone do not justify re-opening it.

**D. Keep one core entry point and rely on tree-shaking.** Write snapshot, restore and hydration as top-level functions rather than session methods, and let esbuild drop them from the element. Rejected as the *mechanism*, though its function shape is kept. It does nothing for core's own 14 kB figure, which NFR-S-02 measures per published entry point. And nothing holds it: one import added to `createSession`'s path pulls the whole resume path into both bundles, and no gate would say why the element grew.

**E. Resume code as its own entry point, `@fhirq/core/resume`, checked by bundle inputs; the remaining reductions ranked now and triggered by gate readings.** Chosen.

## Decision

**1. A third core entry point.**
- **`@fhirq/core/resume`**, with source `packages/core/src/resume.ts`, exports the resume path as top-level functions:
  - `snapshot(session)`;
  - `restoreSession(questionnaire, snapshot, options?)`;
  - `hydrateSession(questionnaire, response, options?)`.

  Their exact signatures are settled with their tests in M3, together with `docs/07-api.md` and a third API report, `packages/core/etc/core-resume.api.md`.
- **What moves behind it:**
  - `session/snapshot`, the serialiser and the stored-state writer that restore uses;
  - `interchange/decode`, `interchange/hydrate`, and the drift, orphan and quarantine policy of `04-domain.md` §8.
- **What stays in `@fhirq/core`:** `interchange/emit`. The element's change and complete events carry the emitted response (AC-09.1.2), and M3 exposes emission from the main entry point.
- **How resume reaches stored state.** `session/` registers each session's stored state in a module-internal `WeakMap`, keyed by the public `Session` object. This is the pattern `session/trace.ts` already uses for the recompute trace. The registry is exported from no entry point. `session/snapshot` is the only module outside `session/session.ts` allowed to import it: the second door into session state that ADR-0010 and §4.1 already name.
- **The dependency runs one way.** Resume modules import session, definition, interchange and codec modules. No module reachable from `src/index.ts` or `src/view/index.ts` imports a resume module.
- **Who imports it.** `@fhirq/react` imports `@fhirq/core/resume` for controlled mode's rehydration (AT2, ADR-0015). `@fhirq/element` does not: E09 has a questionnaire in and a response out, and no resume path.

**2. Budgets.**
- **Unchanged:** `@fhirq/core` ≤ 14 kB, `@fhirq/element` ≤ 24 kB, IIFE ≤ 30 kB. Core's figure now measures the main entry point only.
- **New:** `@fhirq/core/resume` ≤ **4 kB** gzipped, excluding `@fhirq/core`. This is an `ASSUMPTION`: the 5.8–11.6 kB minified estimate gives 1.9–4.9 kB at the < 12 kB ratio (0.33–0.42). It is gated from M3, and its first reading confirms or amends it by an ADR, as S1's figures were.
- **React:** NFR-S-02's React budget excludes `@fhirq/core/resume`, as it already excludes core and view (A2).

**3. The reductions after this one, in order, each triggered by a measured reading rather than a projection.**

| Rung | What | When it is decided | Trigger |
|---|---|---|---|
| 1 | The resume entry point (this ADR) | Now; built in M3 | — |
| 2 | Table-driven element patchers: one control-descriptor table and one patcher, instead of a builder per control kind (S1 §3.6 reduction 2, −0.8 to −1.7 kB). No ADR needed | At the end of M5 | The element projection, rebuilt from **measured** core, resume excluded, **measured** view and **measured** theme, plus S1's renderer range, has a centre over 24 kB |
| 3 | Amend NFR-S-02's element and IIFE figures, by ADR, to the measured M7 figure plus the headroom that ADR argues for | At M7's element gate | The element, built with rung 2, is over 24 kB |
| — | Not embedding the theme (option B) | Not a rung in v1 | Re-opened only by an ADR that also amends ADR-0014, AC-09.1.1 and NFR-C-07 |

Raising a number (rung 3) ranks above breaking the embed (option B). The number is the kit's own competitiveness figure: no incumbent in Brief §4 publishes a smaller one, and it is not a requirement. The embed carries AC-09.1.1 and NFR-C-07, which the secondary user cannot work around. If rung 3 is reached, the published figure changes once, with a measured reason, rather than repeatedly with projected ones.

## Consequences

**Benefits**
- **Core's main entry point keeps its budget with margin:** a projected centre of 12.3 kB against 14 kB, rather than 14.9 kB over it. Resume costs are paid only by hosts that resume.
- **The element's central estimate falls below 24 kB on method (a)** (22.6 kB) without touching the theme, the spec surface or a published number.
- **The boundary is structural:** an entry point and a dependency direction, not a bundler heuristic. A regression fails a named check, not a byte count that grew for reasons nobody traced.
- **The next decisions are pre-weighed.** At M5 and M7 the question is a measured number against a threshold, not a fresh analysis under schedule pressure.

**Costs accepted**
- **On method (b), rung 1 is not enough** (26.6 kB centre), and even rung 2 leaves about 25 kB. The ADR accepts a real chance that rung 3, raising the element's published figure, is reached at M7. It chooses to spend that chance on a measured number rather than on the embed.
- **Hosts learn a third import path** for save and resume: `import { snapshot, restoreSession } from '@fhirq/core/resume'`. It adds no symbols to NFR-U-05's count, but it adds a sentence to every resume example in the docs.
- **Snapshot is a function, not a session method.** The session object no longer answers "how do I save this?" by itself.
- **A second door into stored state.** The `WeakMap` registry is weaker isolation than a closure. It is internal, and lint confines its importers to two modules, but a mistake in `session/snapshot` can now read retained answers. Only the §4.1 table's rule stops that, not the language.
- **A third API report, a third budget row and a third deep-import allowance** to maintain.
- **The 40 % resume share is a judgement.** At 25 %, method (a)'s element centre is 23.5 kB, close enough that rung 2's trigger may fire at M5 regardless.

**Verification**
- **Bundle inputs:** `scripts/measure-bundles.mjs` fails `--check` if the metafile of `@fhirq/core`, `@fhirq/core/view`, `@fhirq/element` or the IIFE lists any input under `session/snapshot`, `interchange/decode`, `interchange/hydrate` or `src/resume.ts`. A must-fail fixture imports `restoreSession` from the main entry point.
- **Budget gate:** `scripts/budgets.json` gains `@fhirq/core/resume` at 4,000 bytes, in `gated` from M3; `@fhirq/core` stays gated.
- **Lint:** the §4.1 import-table rule (`fhirq/core-module-imports`) gains the rows:
  - `resume` may import `session`, `definition`, `interchange` and `fhir/r4`;
  - no module reachable from `index` or `view` may import `resume`, `session/snapshot`, `interchange/decode` or `interchange/hydrate`;
  - only `session/session` and `session/snapshot` may import the state registry.

  `fhirq/no-deep-imports` allows `@fhirq/core/resume`. Each rule has a must-fail fixture.
- **API:** `pnpm api:check` covers `core-resume.api.md` in the required `Engine gates` job; `scripts/test/api-surface.test.js` counts its symbols toward NFR-U-05.
- **The rung-2 trigger** is recorded as a number in `03-nfr.md` §2 at the end of M5, from the three measured gates and S1's renderer range. The M5 close-out cannot be marked done without it (`06-roadmap.md` M5).

**Follow-ups**
- **The 4 kB resume budget** is closed by its first gate reading in M3.
- **Rung 2's trigger** is closed by the M5 reading; rung 3 by M7's element gate.
