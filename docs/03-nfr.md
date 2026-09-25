# FHIR Questionnaire Kit — Non-Functional Requirements

*Phase: business analysis. Input: `01-brief.md`, `02-requirements.md`. Every number here is a build gate or a published claim. Next: architecture → milestones → build.*

*Revised after architecture: `05-architecture.md` §9 AT1 and AT4, and §8 A1 and A2, were accepted on 2026-09-15 and are folded into NFR-S-07, NFR-X-09 and NFR-S-02.*

---

## 0. How to read this document

**Every NFR is one of two things.** Either it is *enforced* — a CI gate that fails the build — or it is *published* — a figure stated in the README, docs or conformance matrix and therefore checkable by an adopter. An NFR that is neither is deleted; it is decoration, and Brief §6 says decoration gets cut.

**Numbers are chosen to be defensible, not aspirational.** An adopter who asks "why 14 kB?" must get an answer better than "it sounded small". Where the answer is currently "it sounded right", the number is marked `ASSUMPTION:` and listed in §11 for correction.

**Reference hardware.** All timing figures are measured on the CI runner class in NFR-M-07 unless a mobile figure is stated. **Reference: a 4-core standard GitHub-hosted `ubuntu-latest` runner, as observed for this public repository (recorded 2026-09-17, N1); it replaced a 2-core assumption. ASSUMPTION: mobile figures assume a mid-tier Android device at 4× CPU throttling in Lighthouse.**

| Column | Meaning |
|---|---|
| **Gate** | Build fails if breached |
| **Published** | Appears in README / docs / conformance matrix |
| **Target** | Tracked, not blocking |

---

## 1. Performance

The primary user is a clinical team; forms are long, devices are often old tablets in clinics. Responsiveness under scale is the requirement, not raw throughput.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-P-01 | Session creation, including initial `enableWhen` evaluation, measured on **two** committed fixtures: 25 items (the observed median) and 500 items (the observed p90) | 25-item fixture ≤ 50 ms p95. 500-item fixture: **1.55 ms median, 6.9 ms p99**, measured 2026-09-17 on the CI runner and published in `benchmarks/baseline.json` (1.05–1.97 ms across runner models); held by the 20 % regression gate against the merge base | Gate |
| NFR-P-02 | Re-evaluation after one answer change, cascade depth 5, on the same two fixtures | 25-item fixture ≤ 5 ms p95, ≤ 16 ms p99. 500-item fixture: **0.064 ms median, 0.10 ms p99**, measured and held the same way | Gate |
| NFR-P-03 | Keystroke to painted character in a text item | ≤ 16 ms (one 60 fps frame) on reference hardware. **Read 2026-09-24 on the CI runner** (M6 AC-10, report only): the React adapter's script per keystroke is **1.5 ms median, 3.0 ms p95** at 500 items, and no form paints later than a bare textarea, which itself paints at 24 ms there (below) | Target |
| NFR-P-04 | Scale ceiling supported and tested | 1,000 items; 500 `enableWhen` conditions; 50 instances of a repeating group; 20 items per repeat instance — **confirmed 2026-09-16** against 300 surveyed instruments (`00-s0-instrument-survey.md`), except the 50-instance figure, which a `Questionnaire` cannot evidence | Gate + Published |
| NFR-P-05 | Maximum supported nesting and cascade depth | group nesting 10; `enableWhen` dependency chain 10 — **confirmed 2026-09-16**; observed maxima are 10 and 5. **As enforced from M2** (INV-D-07, fixture `depth-ceilings`): a group may sit inside at most 9 other groups, so 10 nested groups load and 11 do not; a dependency path may have at most 10 condition edges, counted along the longest path through `enableWhen` references, so a chain of 11 items loads and one of 12 does not | Gate + Published |
| NFR-P-06 | Playground load on mid-tier mobile over simulated 4G | LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1, Lighthouse performance ≥ 90 | Gate |
| NFR-P-07 | Response emission from a 1,000-item session | ≤ 20 ms p95 | Target |
| NFR-P-08 | Peak engine heap for a 1,000-item session with 50 repeats | ≤ 8 MB. Retained heap on the synthetic ceiling fixture: **2.14 MB** (2026-09-17, CI runner), gated for regression against its baseline | Target |
| NFR-P-09 | Re-evaluation cost must be sub-linear in total item count | recompute set size = transitive dependents only, asserted by test | Gate |

**Resolved 2026-09-16 (`06-roadmap.md` §6 decision 4), from spike S0.** The ceiling was challenged first, as this section asked, by surveying 300 published instruments from two production libraries (`00-s0-instrument-survey.md`). It survived: 1,000 items is the observed 99th percentile, 20 items per repeat instance is above the observed maximum of 18, and group nesting 10 is exactly the observed maximum. The 500-condition and chain-10 figures are headroom — observed maxima are 161 and 5 — and are kept, because no code is sized by them.

What the survey did contradict is the *benchmark anchor*, not the ceiling. Real instrument sizes are bimodal: 209 of 300 are ≤ 50 items and 57 are ≥ 200, with only 34 in between. The old single 200-item anchor for NFR-P-01/02 sat in that trough, so both are now measured on two fixtures, 25 items and 500. The remaining `ASSUMPTION` in this section is the **50 repeat instances** of NFR-P-04, which a `Questionnaire` definition cannot evidence: it is a property of a response, and M2 checks it against `QuestionnaireResponse` data or records it as deliberate headroom in writing. **Recorded 2026-09-17 as deliberate headroom** (`06-roadmap.md` M2 D8): no PHI-free response corpus was sourced, so 50 is not evidenced, and the engine is tested and benchmarked at it (`fixtures/bench/ceiling.json`, `packages/core/test/property/ceiling.test.ts`).

S0 carries one further consequence for M2's fixture design, outside these numbers: size and logic are anti-correlated in the real corpus. Not one of the 200 LOINC-derived panels sampled carries a single `enableWhen`, `repeats` or calculated expression, and the most conditional instrument found has 161 conditions over 697 items. A fixture that is simultaneously at every ceiling is a synthetic stress case and is labelled as one.

**NFR-P-03, read 2026-09-24 (M6 AC-10, plan D10), report only.** The reading comes from `tests/browser/keystroke.spec.ts` (`pnpm test:keystroke`), run on the CI runner: ubuntu-24.04, headless Chromium 153, production builds of React 18 and 19, the spec alone on one worker. It types 50 characters into a text item, one every two frames, and Event Timing reads each keystroke twice:
- **Paint** is the `keydown` entry's duration, from the key to the frame that painted it, rounded to 8 ms. Event Timing reports nothing under 16 ms, so paint figures cover only the keystrokes it reported; the rest painted within a frame.
- **Script** runs from the first handler of the keystroke's events to the end of the last. React renders inside them.

The two majors read within 0.1 ms of each other at the median. Each figure below is the higher of the two.

| Page | Reported at ≥ 16 ms | Paint, median / max | Script, median / p95 / max |
|---|---|---|---|
| Bare textarea, no form (the control) | 49–50 of 50 | 24 / 24 ms | 0.4 / 0.6 / 0.9 ms |
| Demo | 50 of 50 | 24 / 24 ms | 0.9 / 1.3 / 4.0 ms |
| 500-item bench fixture | 45–47 of 50 | 16 / 24 ms | 1.5 / 2.9 / 5.7 ms |
| The same, controlled by a host that clones every response | 48–50 of 50 | 16 / 24 ms | 1.5 / 3.0 / 6.1 ms |

What the reading shows:
- **No page meets 16 ms on this runner, the control included.** A textarea with nothing behind it paints at 24 ms, so the runner's frame pipeline, not the kit, sets that floor.
- **The kit adds no paint latency:** every form's median and maximum is at or under the control's.
- **The kit's share is script:** 3.0 ms at p95 with 500 items, under a fifth of a frame.
- **Controlled by response:** a host that clones every response costs nothing measurable, so the semantic compare ADR-0015 runs on each keystroke is not a cost.
- **No relief is needed.** D10's relief, skipping untouched subtrees in `view/`, is not taken and is not a follow-up.

What it does not show:
- **It is not a device reading.** The runner is not the reference hardware (§1: older tablets in clinics), and no device has been measured.
- **Whether to re-state NFR-P-03** as what the kit controls (script time, or paint relative to the control) is returned to the maintainer at M6's close-out (`06-roadmap.md` M6, "Still open"). The wording is unchanged until then.

**Note on measurement.** Performance gates run as a benchmark suite with a fixed fixture set. Regressions > 20% fail the build even when still inside the absolute number, because a silent 19% drift per release is how budgets die. **Revised 2026-09-17 (`06-roadmap.md` M2 D7):** unchanged code measured up to 2.2× apart across hosted runner jobs and about 1 % apart within one, so a timing is compared with the pull request's merge base benchmarked in the same job, never with a committed figure. Retained heap does not vary by runner and is compared with `benchmarks/baseline.json`, whose timings are published reference figures. **What this gives up:** drift in steps each under 20 % is not caught per PR. The published figures are re-measured and compared by hand at each release.

---

## 2. Size and dependency footprint

This is the competitive position (Brief §4). It is the number an adopting team's dependency review will actually check, so it is enforced hardest.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-S-01 | Runtime dependencies, each published package | **0 direct, 0 transitive** | Gate + Published |
| NFR-S-02 | Bundle budgets, minified + gzipped, per published entry point | `@fhirq/core` ≤ 15 kB (measured, ADR-0022) · `@fhirq/core/resume` ≤ 4 kB (excl. `@fhirq/core`; ADR-0021, confirmed by its M3 gate reading) · `@fhirq/core/view` ≤ 8.2 kB (measured, ADR-0023) · `@fhirq/react` ≤ 6 kB (excl. React, `@fhirq/core`, `@fhirq/core/resume` and `@fhirq/core/view`) · `@fhirq/element` ≤ 24 kB (standalone, incl. core, view and default theme) · `@fhirq/themes` structural stylesheet `base.css` ≤ 4 kB, and ≤ 3 kB per theme preset | Gate + Published |
| NFR-S-03 | Script-tag IIFE bundle for the embed case, total transfer | ≤ 30 kB gzipped | Gate + Published |
| NFR-S-04 | Tree-shaking effectiveness: importing only the headless core from the React package | ≤ 60% of full package size reaches the bundle | Target |
| NFR-S-05 | Peer dependencies | React ≥ 18 only, on `@fhirq/react`; no peer deps on any other package | Published |
| NFR-S-06 | Direct development dependencies across the monorepo | ≤ 40 | Target |
| NFR-S-07 | Dev dependency licence allowlist | MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD; **plus MPL-2.0 for dev-only tools that are never bundled or redistributed**, such as the automated accessibility engine. No other licence, and no MPL-2.0 code in any published package (enforced together with NFR-S-08). Checked against each **direct** dev dependency's `license` field (ADR-0018); transitive dev-only packages are not gated | Gate |
| NFR-S-08 | Published package contents | dist + types + README + LICENSE + NOTICE only; no source maps to source, no tests, no fixtures | Gate |

**ASSUMPTION: every byte figure in NFR-S-02/03/04 and the count in NFR-S-06.** These should be re-baselined after the core engine spike, not before. The failure mode to avoid is setting a budget so tight that the accessibility and validation code cannot fit, then quietly raising it — adopters who relied on the published figure would rightly stop trusting the others.

**S1 budget verdict — approved 2026-09-17 (M1 AC-2; proposed 2026-09-16).** Spike S1 measured the slice and extrapolated it two ways (`00-s1-architecture-and-bytes.md` §2–3). Published bands, gzipped: core 5.3–14.1 kB, view 3.0–9.0 kB, react 1.9–8.3 kB, element 12.6–35.5 kB (centres 18.8 and 24.2 kB), IIFE 12.8–35.7 kB, `base.css` 1.8–3.8 kB, preset 0.7–1.3 kB. **Decision: keep every NFR-S-02/03 figure unchanged, and keep R1 open.** The core, view, react, element and IIFE bands each contain their budget (core's only at its top edge, 14.1 against 14 kB); both stylesheet bands sit wholly under theirs. Amending the numbers on bands this wide would replace one assumption with another, which is the failure mode this paragraph warns about. The figures stay `ASSUMPTION`s. The next readings are the budget gates themselves, in the order they switch on (`06-roadmap.md` §5): **core at M2**, **view at M5** — the likeliest first overrun, since method (b)'s centre is 6.2 kB against 5 kB — react at M6, element and IIFE at M7. Three reductions are named in advance (`00-s1-architecture-and-bytes.md` §3.6); only the third, not embedding the theme, needs an ADR, and none of them brings the element's pessimistic edge under 24 kB. **Tripwire:** if a gate's first reading, scaled by the share of its layer's scope still to build, puts the element's central estimate over 24 kB, the ADR weighing ADR-0014's and this requirement's options is drafted before the next milestone starts.

**Core's first gate reading, 2026-09-17 (M2): 10.16 kB of 14 kB, and the tripwire reads as triggered.** The gate holds today. What it measures is further along than S1 assumed, though.
- **Size of what is built.** Core without `view/` is 1,990 source lines. That is already S1 method (b)'s low estimate for the *whole* core (1,980–3,340). It minifies at 14.5 bytes per line against the slice's 12.4, because it carries lenient-mode branches and one diagnostic code per invariant, the density bias §3.5 of S1 named.
- **What is still to build.** M3's validation rules, cross-field runner, emission, snapshot and hydration, and M4's option resolution and port wiring, at an estimated 1,000–2,000 more lines. Full core would then be 43–58 kB minified. At S1's 30–60 kB gzip band (0.25–0.34), that is **10.8–19.7 kB, centre about 15 kB**, over core's 14 kB.
- **The element.** Replacing S1's core centre (9.0 / 9.7 kB) with 15 kB moves the element's centres from 18.8 / 24.2 kB to about **24–29 kB**. The element measures 14.17 kB today, with the real engine and the spike's view and renderer.

The remaining-scope figure is a judgement, as S1's were. **Decided 2026-09-17 by ADR-0021.** Resume code (snapshot, restore, decode, hydrate) ships as `@fhirq/core/resume`, which neither `@fhirq/core` nor the element can reach. That makes S1's reduction 1 structural, and brings the projected centres to 12.3 kB for core and 22.6 / 26.6 kB for the element. The published figures stay. The next reductions are ranked and triggered by measured readings: table-driven patchers if the element projection rebuilt from measured gates at the end of M5 is over 24 kB, then an ADR amending the element and IIFE figures if M7's measured element is still over. Not embedding the theme is not a v1 option.

**M3 readings, 2026-09-18: `@fhirq/core` 12.81 kB of 14 kB, and `@fhirq/core/resume` 3.34 kB of 4 kB, both gated.** The resume figure confirms ADR-0021's 4 kB and closes A7. Neither main entry, view nor element reaches the resume path, a blocking check since M3.
- **What M3 cost.** Main entry 28.8 → 36.8 kB minified (+8.0 kB: validation, cross-field rules, emission and the R4 encoder); resume 8.9 kB minified (snapshot, restore, decode, hydration). That is 16.9 kB in all, inside ADR-0021's 14.5–29.0 kB for M3 and M4 together. The resume share of it is 53 %, above the 40 % the ADR judged, which is the direction that helps the main entry.
- **What it means for core.** At 12.81 kB, core's main entry is already over ADR-0021's projected centre for M3 and M4 together (12.3 kB), before M4's option resolution and port wiring. At M3's own rate, 0.33 kB gzipped per kB minified, M4 fits in the remaining 1.19 kB only if it stays under about 3.6 kB minified. **This is the plan's 13 kB flag, raised early**: it is a reading, not yet a decision, and the M4 plan has to size its scope against it.
- **The element** measures 16.29 kB with measured core, the spike's view, renderer and theme; rung 2's trigger is still read at the end of M5, from measured view and theme.

**M4 reading, 2026-09-19: `@fhirq/core` 14.60 kB, over 14 kB; `@fhirq/core/resume` 3.35 kB of 4 kB.** M4 cost about 4.8 kB minified and 1.79 kB gzipped, against the 3.6 kB minified the M3 reading allowed. About half is new modules (option resolution, scoring, the calculated-value pass, the collaborator guard: 2.4 kB minified) and half their wiring. The plan's 13.8 kB stop fired; compacting the new modules took 14.68 to 14.57 kB, and what is left is mostly M2 and M3 code.
- **Decided by ADR-0022 (Accepted 2026-09-19):** core's figure becomes **15 kB**, the measured reading of the finished engine scope plus a 0.40 kB margin sized for fixes and US-07.3's `Should` scheduling, not for new features. It is no longer an `ASSUMPTION`. The gate blocks at 15,000 bytes.
- **The element**, projected as ADR-0021 did with measured core in place of its 12.3 kB centre: **24.9 kB (method a) and 28.9 kB (method b)**, both over 24 kB. It measures 18.24 kB today with the spike's view, renderer and theme. ADR-0021's ladder is unchanged; rung 2's trigger, read at the end of M5, is now expected to fire.

**M5 reading, 2026-09-23: `@fhirq/core/view` 7.77 kB, over 5 kB; `@fhirq/core` 14.68 kB of 15 kB.**
- **The view** is built to its scope: 1,017 source lines, 19.8 kB minified, a ratio of 0.39. Without the kernel modules core already bundles, it is 7.36 kB, and the `en` catalogue alone is 0.77 kB. The plan's 4.6 kB stop (M5 plan D9) was passed on the way to a whole view. A trimming pass that changes no behaviour saved 0.03 kB.
- **Decided by ADR-0023 (Accepted 2026-09-23):** the view's figure becomes **8.2 kB**, the measured reading of the finished view plus a 0.44 kB margin sized for renderer-driven fields and fixes, not for new behaviour. It is no longer an `ASSUMPTION`. The gate blocks at 8,200 bytes.
- **Core** grew 0.08 kB for `questionnaire-unitOption` (M5 plan D6). Margin 0.32 kB of ADR-0022's 0.40.
- **ADR-0021's rung-2 reading (M5 AC-11, plan D8): the trigger fires.** The element is projected from the measured gates, as the ADR specifies: core 14.68 kB, and the view less the kernel it shares with core (7.36 kB). To those it adds S1's element renderer (13.0–22.6 kB minified: 3.6–8.6 kB gzipped at the 0.28–0.38 band for that size, centre 5.9 kB) and a theme. D8 records the theme two ways and triggers on the conservative one:
  - **(a) the measured theme slice** (0.99 kB, M1's): centre **28.9 kB**, range 26.6–31.6 kB;
  - **(b) S1's full-theme band** (9.5–16.0 kB minified, centre about 4.2 kB gzipped): centre **32.1 kB**.

  Rebuilt instead from the element as it is built today (67.4 kB minified, 23.57 kB gzipped, a ratio of 0.35), with the spike renderer and theme replaced by S1's ranges, the centres are 27.8 kB (a) and 31.1 kB (b). S1's 0.22–0.31 ratio for bundles over 60 kB would give 21.1 kB (a) and 23.6 kB (b), but the element as built does not compress that well. **Every reading but that one is over 24 kB, so M7 builds table-driven patchers (rung 2).** Rung 2 saves 0.8–1.7 kB, which leaves the element's centre at about 26–31 kB. Rung 3, amending the element's figure by ADR at M7, is now the expected outcome (ADR-0023, Costs accepted).
- **The element** measures 23.57 kB today, with the full view and the spike renderer and theme.

**M6 reading, 2026-09-24: `@fhirq/react` 4.13 kB of 6 kB, gated.**
- **Measured as NFR-S-02 words it** (M6 plan D6): a production build, with React, `@fhirq/core`, `@fhirq/core/view` and `@fhirq/core/resume` external. The development checks are stripped from it.
- **Inside S1's band** of 1.9–8.3 kB. The plan's 5.5 kB stop-line did not fire, so 6 kB stands with no ADR. The gate blocks at 6,000 bytes from #68.
- **By step:** the hook 1.66 kB, the default UI for 18 kinds 3.28 kB, controlled mode 3.78 kB, tier 3 4.10 kB, and the hydration tolerance for ICU skew 4.13 kB (ADR-0020 amendment note).
- **Core** is unchanged at 14.68 kB: M6's two diagnostic codes and the `ControlProps` fix are types only.

---

## 3. Compatibility and portability

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-C-01 | Browser support | Chrome, Edge, Firefox, Safari — last 2 major versions; iOS Safari 16.4+; no IE11, no legacy Edge | Published |
| NFR-C-02 | Consumer environment smoke tests | Node 20 LTS + Node 22 ESM; Node CJS require; Vite; webpack 5; Next.js App Router (server + client); plain browser script tag — 6 environments, all green | Gate |
| NFR-C-03 | Framework versions | React 18 and 19, both tested | Gate + Published |
| NFR-C-04 | `@fhirq/core` DOM independence | 0 references to DOM globals; full test suite passes in a Node environment with no DOM shim | Gate |
| NFR-C-05 | Module formats published | ESM + CJS + `.d.ts` for core/react/themes; ESM + IIFE for element | Published |
| NFR-C-06 | Compile target | ES2022; TypeScript ≥ 5.4 consumers; `strict` plus `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` internally | Published |
| NFR-C-07 | Content Security Policy | Runs under `script-src 'self'; style-src 'self'` with no `unsafe-inline` or `unsafe-eval`; 0 uses of `eval` or `new Function` | Gate + Published |
| NFR-C-08 | SSR | Server render produces markup with no DOM access; 0 hydration warnings across all demo forms | Gate |
| NFR-C-09 | FHIR version | R4 (4.0.1) only; version abstraction documented in an ADR, not implemented | Published |

**ASSUMPTION: NFR-C-01's specific floors (iOS 16.4, last-2-versions), NFR-C-02's environment list, NFR-C-06's TypeScript floor.** iOS 16.4 is chosen because it is the point where modern web component and CSS support settles; if the target user base includes clinic-issued tablets on older iPadOS, this needs lowering and NFR-S-02 will pay for the polyfills.

---

## 4. Correctness and test quality

EVL reads the test suite. Coverage percentage alone is not the signal — the conformance link is.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-Q-01 | Line and branch coverage, `@fhirq/core` | ≥ 95% line, ≥ 90% branch | Gate |
| NFR-Q-02 | Line coverage, adapters and element | ≥ 85% line, ≥ 80% branch. **`@fhirq/react`, gated from M6:** 98.4 % line, 96.3 % branch, measured in Chromium on React 18 and 19 (M6 plan D4) | Gate |
| NFR-Q-03 | Mutation score, `@fhirq/core` engine modules (enablement, validation, emission) | ≥ 80% | Gate |
| NFR-Q-04 | Conformance matrix rows marked `supported` with a linked passing test | 100% | Gate |
| NFR-Q-05 | `enableWhen` operator × answer type coverage | every supported pair has a named test; 0 gaps | Gate |
| NFR-Q-06 | Round-trip property tests: emit → hydrate → emit produces a semantically identical response | ≥ 1,000 generated cases per CI run, 0 failures | Gate |
| NFR-Q-07 | Flaky tests tolerated in the suite | 0 — a test that fails intermittently is quarantined or deleted within one working day | Target |
| NFR-Q-08 | Public API examples in docs that are compiled and executed in CI | 100% | Gate |

**ASSUMPTION: every threshold here.** NFR-Q-03 (mutation testing) is the one with real cost — it is also, alongside NFR-Q-06, the strongest correctness evidence in the suite. If time pressure bites, cut NFR-Q-03's scope to the enablement engine only rather than dropping it entirely.

---

## 5. Accessibility

Brief §3: verifiable, not asserted. Brief §9.4 assumed WCAG 2.2 AA; confirmed here with a verification method attached to each claim, since an unverified claim is worse than no claim in front of this buyer.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-A-01 | Automated accessibility violations, all demo forms × 4 tiers × light/dark themes × 375 px/1280 px | 0 violations at WCAG 2.2 A and AA rule sets | Gate |
| NFR-A-02 | Manual screen reader verification per release | **Confirmed 2026-09-16:** 3 pairs — NVDA + Firefox (Windows), JAWS + Chrome (Windows), VoiceOver + Safari (iOS); dated record published | Published |
| NFR-A-03 | Contrast, default themes | ≥ 4.5:1 body text, ≥ 3:1 large text and non-text UI, both light and dark | Gate |
| NFR-A-04 | Focus indicator | ≥ 2 px thick, ≥ 3:1 contrast against adjacent colours, never removed, visible in `forced-colors` | Gate |
| NFR-A-05 | Target size | ≥ 24 × 24 CSS px for every interactive control, with ≥ 44 × 44 px for primary controls in the default theme | Gate |
| NFR-A-06 | Reflow | No horizontal scrolling at 320 px width or 400% zoom at 1280 px | Gate |
| NFR-A-07 | Keyboard | 100% of interactive elements reachable and operable; 0 keyboard traps; radio groups use roving tabindex | Gate |
| NFR-A-08 | Live-region announcements per user action | ≤ 1 coalesced announcement; announcement latency ≤ 500 ms after state change | Target |
| NFR-A-09 | Known accessibility gaps published | complete and dated; 0 undisclosed known failures | Published |

**NFR-A-02's pairs were resolved on 2026-09-16** (N11, §12 #4): JAWS + Chrome replaces the macOS VoiceOver pair, because JAWS is what the buyer's own accessibility team runs and the iOS pair already covers VoiceOver — and covers A4's Safari 16.4 floor while it is there. **Still ASSUMPTION: NFR-A-05's 44 px primary target and NFR-A-08's numbers.** WCAG 2.2 AA itself is confirmed from the brief. Note that automated tooling catches roughly a third of real issues — NFR-A-02 is not optional padding, it is the part that makes NFR-A-01 honest, and the README should say so rather than implying the automated gate is sufficient.

---

## 6. Security, privacy and supply chain

The no-PHI boundary (Brief §3) is a security property, so it is tested like one.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-X-01 | Network calls originating in `@fhirq/core`, `@fhirq/react`, `@fhirq/themes` | 0, enforced by the throwing-stub test in AC-14.6.1 | Gate + Published |
| NFR-X-02 | Browser storage APIs used by any published package | 0 (`localStorage`, `sessionStorage`, `indexedDB`, cookies, Cache API) | Gate + Published |
| NFR-X-03 | Telemetry, analytics or phone-home in any published package | 0 | Gate + Published |
| NFR-X-04 | Answer data written to `console` or thrown in error messages | 0 — diagnostics carry `linkId` and paths, never answer values | Gate |
| NFR-X-05 | XSS: questionnaire-authored content rendered as HTML without a host-supplied sanitizer | 0 paths; verified by a payload corpus of ≥ 20 known vectors | Gate |
| NFR-X-06 | Known vulnerabilities in the dependency tree at release | 0 high or critical; 0 of any severity in runtime deps, trivially since there are none | Gate |
| NFR-X-07 | Release provenance | npm provenance attestation + CycloneDX SBOM + signed tag on 100% of releases | Gate |
| NFR-X-08 | Security report acknowledgement | ≤ 7 days to acknowledge, ≤ 30 days to patch or publicly document | Published |
| NFR-X-09 | Playground and docs analytics | **none**: no analytics, telemetry, or third-party scripts, fonts or images; both sites served with a Content Security Policy including `connect-src 'none'`; repo attention measured from GitHub traffic stats only | Gate + Published |

**ASSUMPTION: NFR-X-05's corpus size and NFR-X-08's windows.** **NFR-X-09 decided on 2026-09-15 (`05-architecture.md` §9 AT4): no analytics at all.** Any analytics on a page that renders clinical forms is a claim surface. Denying all connections in the CSP makes AC-12.3.2 something the browser enforces rather than a promise. The brief's repo-attention metric is served by GitHub's own traffic stats.

**Explicit non-claim.** The library is not a medical device and makes no safety claim. This sentence appears in the README, the docs and the adoption pack. It costs nothing and its absence is the kind of thing a regulated adopter's quality team flags.

---

## 7. Usability and integration effort

The integration cost is what the primary user actually evaluates.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-U-01 | Time from `npm install` to a rendered, working form following the quickstart | ≤ 5 minutes; ≤ 10 lines of consumer code. **Read 2026-09-24 (M6 AC-1): 13 lines, missed.** A form the host can complete needs the hook and the host's own submit button (`06-roadmap.md` M6, "Still open"). The 5 minutes is untimed until M10 | Published |
| NFR-U-02 | Lines of code to match a host design system via tokens | ≤ 30 lines of CSS, 0 JavaScript | Published |
| NFR-U-03 | Configuration options on the top-level component | ≤ 12, each documented with default and rationale. **`<Questionnaire>`, M6: 11** (M6 plan D9, `07-api.md` §6) | Target |
| NFR-U-04 | STK time to comprehension on the playground | understands what the library does within 30 seconds, no scrolling required on a 375 px viewport | Published |
| NFR-U-05 | Public API symbols exported across all packages | ≤ 60, tracked in a committed API report | Gate |
| NFR-U-06 | Documentation reading time for the full integration guide | ≤ 20 minutes | Target |
| NFR-U-07 | Error messages naming the fix, not just the fault | 100% of load-time errors include the `linkId` path and the rule violated | Gate |

**ASSUMPTION: every number here.** NFR-U-05 is the one worth holding hardest — API surface is the single best proxy an evaluator has for whether the layering is real, and it is much easier to keep small than to shrink later.

---

## 8. Internationalization

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-I-01 | Hard-coded user-facing strings outside the message catalogue | 0, enforced by lint rule | Gate |
| NFR-I-02 | Message catalogue size | ≤ 45 keys, each documented with context | Target |
| NFR-I-03 | Built-in locales shipped | 1 (en) — hosts supply others | Published |
| NFR-I-04 | Date, number and unit formatting | delegated to `Intl` with a host-supplied locale; 0 custom formatting logic; formatted in `view/` from an explicit locale option (ADR-0020) | Gate |
| NFR-I-05 | RTL support | full: logical CSS properties throughout, 0 physical-direction properties in themes; verified by a snapshot test in `dir="rtl"` | Gate |
| NFR-I-06 | Multi-language questionnaires | `Questionnaire.item.text` translation extensions — **out of scope for v1, confirmed 2026-09-16, stated in the conformance matrix with its reason** | Published |

**Still ASSUMPTION: NFR-I-02's key count.** **NFR-I-06's exclusion was confirmed on 2026-09-16** (N19, §6 decision 14), with the second look taken rather than deferred: a regulated clinical buyer operating in the EU may treat translation extensions as table stakes rather than a long-tail SDC feature, and v1 does not target one. If that changes, the feature moves into scope, the conformance-matrix row becomes a supported row, and it touches M2 (parse), M5 (text selection) and M10 (matrix row). **NFR-I-03's single built-in locale was confirmed on the same date:** `en` is the default, hosts supply the rest (§12 #9, ADR-0020).

---

## 9. Maintainability and evolvability

Constraint: a project that must survive at maintenance pace after the initial release (Brief §1, §8).

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-M-01 | Versioning | semver; breaking changes in major only; deprecation notice ≥ 1 minor before removal | Published |
| NFR-M-02 | Cyclomatic complexity per function | ≤ 15, with named exceptions requiring an inline justification comment | Gate |
| NFR-M-03 | Source file length | ≤ 400 lines | Target |
| NFR-M-04 | Public API changes without a report diff in the PR | 0 — API surface diff is a blocking check, `any` in the public surface is 0 | Gate |
| NFR-M-05 | ADR coverage | ≥ 10 ADRs at v1.0, covering at minimum: answer retention on hide; zero-dependency constraint; resolver injection; core/adapter/element layering; state model vs emitted document; customization tier model; FHIRPath exclusion and its seam; R4-only; validation timing and ownership; shadow DOM in the element | Gate + Published |
| NFR-M-06 | Lint rules encoding architectural constraints | ≥ 4 custom rules: no DOM in core, no network API anywhere, no hard-coded user-facing strings, no cross-package deep imports — plus the intra-core module import table of `05-architecture.md` §4.1 row by row, and ADR-0020's pair: `Intl` allowed only under `view/format`, and no `toLocale*` or other ambient-locale call anywhere in core. From M6, the React adapter reads no DOM global on import or during render (ADR-0015), and uses neither `Intl` nor an ambient-locale call. From M7, the element is held to the same pair, and reads the browser's language in `src/locale.ts` only | Gate |
| NFR-M-07 | CI wall-clock time for the blocking PR pipeline | ≤ 10 minutes p95; fast feedback subset (type-check + lint + core unit) ≤ 3 minutes | Target |
| NFR-M-08 | Commit and PR hygiene | conventional commits; every PR links to a story or ADR; 0 direct pushes to the default branch | Published |
| NFR-M-09 | Maintenance mode response commitment | **none stated publicly** — issues triaged monthly, security reports per NFR-X-08, no SLA on features or questions; stated in the README so no support expectation is created | Published |

**ASSUMPTION: NFR-M-02/03/05/07 numbers and the monthly triage cadence in NFR-M-09.** NFR-M-09 is deliberately a *non*-commitment, and stating it plainly is the mitigation for Brief §1's second failure condition — the project growing a support obligation its maintainers cannot sustain.

---

## 10. Project constraints carried from the brief

These are not build gates but they bound every decision above.

| ID | Constraint | Number | Source |
|---|---|---|---|
| NFR-Z-01 | Main build effort | **Confirmed 2026-09-16: 13–15 weeks at 12–15 hours per week, so roughly 184 hours total** (`06-roadmap.md` §6 decision 1, §7). This replaces the 3–4 weeks / 40–60 hours of Brief §8, which was an estimate made before the plan existed. The weekly pace is unchanged; the total moved to meet it | Brief §8; `06-roadmap.md` §7 |
| NFR-Z-02 | Completeness | 0 layers shipped in a partial state; there is no phase two to defer to | Brief §5, §8 |
| NFR-Z-03 | Defensibility | 100% of decisions arguable unaided by the maintainer | Brief §8 |
| NFR-Z-04 | Licence | Apache-2.0, for the explicit patent grant the primary user's legal team looks for — **recommendation confirmed; Brief §9.2 asked for confirmation** | Brief §9.2 |
**Effort reality check, and the cut ladder's verdict.** NFR-Z-01 was the riskiest number in either document. Taken at face value, 40–60 hours had to absorb: a rules engine with mutation-tested correctness, four packages, a web component, four customization tiers, a WCAG 2.2 AA-verified default UI, a playground, a docs site, twenty ADRs and a CI pipeline with twenty-one blocking gates. `06-roadmap.md` §7 summed the plan at roughly 184 hours, about three times the assumption.

**Resolved 2026-09-16 (`06-roadmap.md` §6 decision 1): the number moved, and the cut ladder is declined for now.** The published ladder — NFR-Q-03 mutation scope → E12 US-12.4/12.5 playground extras → the print stylesheet → NFR-A-02 reduced to two screen reader pairs — recovers roughly 14 hours against a gap of about 124. It was sized for schedule pressure, not for a 3× mismatch, so spending it would trade real verification depth for a ninth of the problem.

**The ladder is not withdrawn; it is held in reserve.** Its first two rungs (mutation scope, then the playground extras) are the ones to spend first if M1's measured pace shows the 184-hour estimate is itself optimistic, and M1 exists partly to make that call better informed. Cutting docs, ADRs or accessibility remains off the ladder entirely: that would remove the exact evidence adopters need to verify the principles in Brief §6.

---

## 11. Assumption register

Every number in this document that the brief did not fix. Correct these before milestone planning.

| # | Ref | Assumed value | Why it matters |
|---|---|---|---|
| N1 | §0 | 2-core CI runner + 4× throttled mobile as reference hardware. **Observed 2026-09-17 (M2):** `ubuntu-latest` gives this public repository **4 cores** (`nproc`) on varying AMD EPYC models (7763, 9V45, 9V74), and every M2 timing is from those runners. **Resolved 2026-09-17:** 4 cores is recorded as the observed reference. Runner CPU models still vary, which is why timing gates compare within one job (`06-roadmap.md` M2 D7) | All timing figures are meaningless without it |
| N2 | NFR-P-01…09 | **Resolved 2026-09-16** by spike S0 (`00-s0-instrument-survey.md`, 300 instruments): NFR-P-04's ceiling and NFR-P-05 confirmed; NFR-P-01/02 re-anchored to 25-item and 500-item fixtures. **2026-09-17 (M2 step 10):** the millisecond figures are measured on the CI runner and committed as `benchmarks/baseline.json`; NFR-P-04's **50 repeat instances** is recorded as deliberate headroom rather than evidenced (M2 D8) | The ceiling was challenged first, as §1 asked, and held |
| N3 | NFR-S-02/03/04 | Core ≤ 15 kB (14 kB until ADR-0022), view ≤ 8.2 kB (5 kB until ADR-0023), react ≤ 6 kB (excl. React, core and view), element ≤ 24 kB, `base.css` ≤ 4 kB, theme preset ≤ 3 kB, IIFE ≤ 30 kB; from ADR-0021, `@fhirq/core/resume` ≤ 4 kB, and react's figure also excludes it. **S1 measured the slice on 2026-09-16** (element 5.84 kB standalone) **and extrapolated bands that straddle the core (at its top edge only), view, react, element and IIFE budgets** (§2 note, `00-s1-architecture-and-bytes.md`). **Approved 2026-09-17:** figures unchanged, still assumed; each is re-read when its budget gate switches on. **Core's M2 reading tripped §2's tripwire; ADR-0021 holds the figures by a structural split and ranked, measured reductions** | Published competitive claim; re-baseline after the engine spike |
| N4 | NFR-S-06 | ≤ 40 direct dev dependencies | Soft; keeps the dev toolchain small enough to audit, not a hard constraint |
| N5 | NFR-C-01 | Last 2 browser versions, iOS Safari 16.4+ | Lowering this costs bundle size |
| N6 | NFR-C-02 | The six consumer environments | Each one added costs CI time |
| N7 | NFR-C-06 | TypeScript ≥ 5.4 consumer floor | Too high excludes conservative enterprise toolchains |
| N8 | NFR-Q-01/02 | 95%/90% core, 85%/80% adapters | |
| N9 | NFR-Q-03 | 80% mutation score on engine modules | Highest-cost gate, and the strongest correctness evidence |
| N10 | NFR-Q-06 | 1,000 generated round-trip cases per run | Trades CI time for correctness confidence |
| N11 | NFR-A-02 | **Resolved 2026-09-16:** three pairs, and these three — NVDA + Firefox (Windows), JAWS + Chrome (Windows), VoiceOver + Safari (iOS). JAWS is what the buyer's accessibility team uses, NVDA is what an evaluator can reproduce for free, and VoiceOver on iOS also exercises A4's Safari 16.4 floor | Manual effort per release, recurring. The cut ladder's fourth rung would drop this to two; it was not taken |
| N12 | NFR-A-05 | 44 px primary targets above the 24 px AA floor | Affects default theme density |
| N13 | NFR-A-08 | ≤ 1 announcement per action, ≤ 500 ms | |
| N14 | NFR-X-05 | ≥ 20-vector XSS payload corpus | |
| N15 | NFR-X-08 | 7-day acknowledge / 30-day patch | A public commitment; keep it conservative given NFR-M-09 |
| N16 | NFR-X-09 | **Resolved 2026-09-15:** no analytics; CSP `connect-src 'none'` (AT4) | No longer an assumption |
| N17 | NFR-U-01…07 | All integration-effort figures | NFR-U-05's 60-symbol API cap is the one to hold |
| N18 | NFR-I-02 | ≤ 45 message keys | |
| N19 | NFR-I-06 | **Resolved 2026-09-16: excluded from v1,** and recorded as a conformance-matrix row with its reason rather than left silent. Reconsider before v1.1 if a European buyer comes into view; moving it in touches M2 (parse), M5 (text selection) and M10 (matrix row) | A market call, taken deliberately rather than by default |
| N20 | NFR-M-02/03 | Complexity ≤ 15, file ≤ 400 lines | |
| N21 | NFR-M-05 | ≥ 10 ADRs, list as given | The list itself is the real assumption |
| N22 | NFR-M-07 | **Measured 2026-09-16.** The fast lane's first run on GitHub Actions, on a 2-core `ubuntu-latest` runner with a **cold pnpm cache**, took **22 s of run wall-clock (20 s of job time)**: checkout 1 s, Node setup 4 s, Corepack and pnpm 2 s, install 3 s, typecheck 1 s, lint 1 s, unit tests 2 s, caching and teardown 3 s (run 35085893602). Locally the same three steps take 5.2 s. NFR-M-07's 3-minute fast-lane figure is **met with two orders of magnitude of headroom on M0's tree**; it is not yet a statement about a full tree. The 10-minute full-pipeline figure stays an assumption until M11 | 22 s over a near-empty tree says the harness costs almost nothing — roughly 11 s of it is fixed setup that will not grow. The number to watch is the slope from M2 on, not this baseline. **M2 reading, 2026-09-17** (run 35213601103, 4-core runner, warm cache): fast lane **36 s** (typecheck 4 s, type-aware lint 7 s, 764 unit tests 5 s); engine gates 25 s; incremental mutation **2 min 54 s**; the blocking pipeline **2 min 58 s** wall-clock, since lanes run in parallel. The slope is in the mutation lane: one PR that touched most test files took 5 min 26 s before the scale-ceiling test left the mutation suite (`00-s2-mutation-cost.md` §7). **M3 reading, 2026-09-18** (PRs #34–#40): fast lane 30–43 s, engine gates 28–31 s, benchmarks 59–68 s; incremental mutation 106 and 124 s on the two PRs that added no new mutated module, then **423, 291, 280, 498 and 396 s**. The blocking pipeline is therefore 5–8.3 min wall-clock, still inside 10 min, but the mutation lane is past spike S2's K1 (> 4 min) on five PRs running |
| N23 | NFR-M-09 | Monthly issue triage | Deliberately minimal; protects Brief §1 |
| N24 | NFR-Z-01 | **Resolved 2026-09-16:** 12–15 hrs/week confirmed; the total moved to **≈ 184 hours, 13–15 weeks** (`06-roadmap.md` §6 decision 1, §7). The cut ladder in §10 is declined and held in reserve, its first two rungs to be spent first if M1's measured pace says the estimate is optimistic | No longer an assumption; the remaining risk is the per-milestone estimates (`06-roadmap.md` §9 P1) |

---

## 12. Open questions returned to product

Carried from Brief §9, with a BA position on each; later additions are marked *New*. All are decidable now. Rows 1–8 blocked milestone planning and row 9 blocked M5; **all nine were closed on 2026-09-16** as part of M0 (`06-roadmap.md` §6, and the sheet they were answered on, `00-m0-decisions.md`).

| # | Question | Position |
|---|---|---|
| 1 | Demo questionnaire | **Confirmed 2026-09-16:** original "pre-visit intake" fixture per AC-15.1.3, with PHQ-9 as a flat secondary fixture for the scoring docs. S0 supports the choice: real instruments are either large and flat or small and conditional, so a demo that shows nested groups, repeats, cascades and validation in one artefact has to be authored |
| 2 | Licence | Apache-2.0. **Confirmed as recommended, no objection from analysis** |
| 3 | Naming / brand | Defer past launch as the brief proposes. A brand name adds no evidence for any principle in §6 |
| 4 | Accessibility target | WCAG 2.2 AA, verified per §5 — automated gate in CI plus a published dated manual record. **Confirmed 2026-09-16:** three pairs — NVDA + Firefox (Windows), JAWS + Chrome (Windows), VoiceOver + Safari (iOS). See N11 |
| 5 | Reference backend | **Dropped, confirmed 2026-09-16.** Serves no principle in §6, adds a Docker surface and a thing that can break on an evaluator's machine — the one place the kit cannot afford to fail. ADR-0019 already assumed this |
| 6 | Scoring extension point | **Confirmed 2026-09-16:** extension point in core (US-07.2); PHQ-9/GAD-7 as a documented example and test fixture, not a published package. A fifth published package would reopen ADR-0008's lockstep surface and NFR-S-01's dependency claim for something an adopter copies in twenty lines |
| 7 | *New* — effort budget | **Resolved 2026-09-16:** 12–15 hrs/week at ≈ 184 hours, 13–15 weeks. NFR-Z-01 restated; §10's cut ladder declined in writing and held in reserve. See N24 |
| 8 | *New* — playground analytics | NFR-X-09. **Resolved 2026-09-15: none** (`05-architecture.md` §9 AT4) |
| 9 | *New* — default locale | ADR-0020 settled the mechanism: `view/` formats, the locale is an explicit presentation option. **Resolved 2026-09-16: `en` is the default and the only built-in locale; hosts supply any other.** The catalogue is ≤ 45 keys (NFR-I-02) and the locale is already an explicit option, so a second built-in adds maintenance and bytes without adding capability. Revisit together with N19 if translation extensions come into scope |
