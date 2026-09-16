# FHIR Questionnaire Kit — Non-Functional Requirements

*Phase: business analysis. Input: `01-brief.md`, `02-requirements.md`. Every number here is a build gate or a published claim. Next: architecture → milestones → build.*

*Revised after architecture: `05-architecture.md` §9 AT1 and AT4, and §8 A1 and A2, were accepted on 2026-09-15 and are folded into NFR-S-07, NFR-X-09 and NFR-S-02.*

---

## 0. How to read this document

**Every NFR is one of two things.** Either it is *enforced* — a CI gate that fails the build — or it is *published* — a figure stated in the README, docs or conformance matrix and therefore checkable by an adopter. An NFR that is neither is deleted; it is decoration, and Brief §6 says decoration gets cut.

**Numbers are chosen to be defensible, not aspirational.** An adopter who asks "why 14 kB?" must get an answer better than "it sounded small". Where the answer is currently "it sounded right", the number is marked `ASSUMPTION:` and listed in §11 for correction.

**Reference hardware.** All timing figures are measured on the CI runner class in NFR-M-07 unless a mobile figure is stated. **ASSUMPTION: a 2-core standard GitHub-hosted runner is the reference; mobile figures assume a mid-tier Android device at 4× CPU throttling in Lighthouse.**

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
| NFR-P-01 | Session creation from a 200-item questionnaire, including initial `enableWhen` evaluation | ≤ 50 ms p95 | Gate |
| NFR-P-02 | Re-evaluation after one answer change, 200-item questionnaire, cascade depth 5 | ≤ 5 ms p95, ≤ 16 ms p99 | Gate |
| NFR-P-03 | Keystroke to painted character in a text item | ≤ 16 ms (one 60 fps frame) on reference hardware | Target |
| NFR-P-04 | Scale ceiling supported and tested | 1,000 items; 500 `enableWhen` conditions; 50 instances of a repeating group; 20 items per repeat instance | Gate + Published |
| NFR-P-05 | Maximum supported nesting and cascade depth | group nesting 10; `enableWhen` dependency chain 10 | Gate + Published |
| NFR-P-06 | Playground load on mid-tier mobile over simulated 4G | LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1, Lighthouse performance ≥ 90 | Gate |
| NFR-P-07 | Response emission from a 1,000-item session | ≤ 20 ms p95 | Target |
| NFR-P-08 | Peak engine heap for a 1,000-item session with 50 repeats | ≤ 8 MB | Target |
| NFR-P-09 | Re-evaluation cost must be sub-linear in total item count | recompute set size = transitive dependents only, asserted by test | Gate |

**ASSUMPTION: all figures in this section.** The brief sets no performance numbers. NFR-P-04's ceiling is the one to challenge first — if real instruments in the target domain are ≤ 150 items, the ceiling is over-engineered and NFR-P-01/02 should be re-anchored to that size.

**Note on measurement.** Performance gates run as a benchmark suite with a fixed fixture set, comparing against a committed baseline. Regressions > 20% fail the build even when still inside the absolute number, because a silent 19% drift per release is how budgets die.

---

## 2. Size and dependency footprint

This is the competitive position (Brief §4). It is the number an adopting team's dependency review will actually check, so it is enforced hardest.

| ID | Requirement | Number | Type |
|---|---|---|---|
| NFR-S-01 | Runtime dependencies, each published package | **0 direct, 0 transitive** | Gate + Published |
| NFR-S-02 | Bundle budgets, minified + gzipped, per published entry point | `@fhirq/core` ≤ 14 kB · `@fhirq/core/view` ≤ 5 kB · `@fhirq/react` ≤ 6 kB (excl. React, `@fhirq/core` and `@fhirq/core/view`) · `@fhirq/element` ≤ 24 kB (standalone, incl. core, view and default theme) · `@fhirq/themes` structural stylesheet `base.css` ≤ 4 kB, and ≤ 3 kB per theme preset | Gate + Published |
| NFR-S-03 | Script-tag IIFE bundle for the embed case, total transfer | ≤ 30 kB gzipped | Gate + Published |
| NFR-S-04 | Tree-shaking effectiveness: importing only the headless core from the React package | ≤ 60% of full package size reaches the bundle | Target |
| NFR-S-05 | Peer dependencies | React ≥ 18 only, on `@fhirq/react`; no peer deps on any other package | Published |
| NFR-S-06 | Direct development dependencies across the monorepo | ≤ 40 | Target |
| NFR-S-07 | Dev dependency licence allowlist | MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD; **plus MPL-2.0 for dev-only tools that are never bundled or redistributed**, such as the automated accessibility engine. No other licence, and no MPL-2.0 code in any published package (enforced together with NFR-S-08) | Gate |
| NFR-S-08 | Published package contents | dist + types + README + LICENSE + NOTICE only; no source maps to source, no tests, no fixtures | Gate |

**ASSUMPTION: every byte figure in NFR-S-02/03/04 and the count in NFR-S-06.** These should be re-baselined after the core engine spike, not before. The failure mode to avoid is setting a budget so tight that the accessibility and validation code cannot fit, then quietly raising it — adopters who relied on the published figure would rightly stop trusting the others.

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
| NFR-Q-02 | Line coverage, adapters and element | ≥ 85% line, ≥ 80% branch | Gate |
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
| NFR-A-02 | Manual screen reader verification per release | 3 pairs: NVDA + Firefox (Windows), VoiceOver + Safari (macOS), VoiceOver + Safari (iOS); dated record published | Published |
| NFR-A-03 | Contrast, default themes | ≥ 4.5:1 body text, ≥ 3:1 large text and non-text UI, both light and dark | Gate |
| NFR-A-04 | Focus indicator | ≥ 2 px thick, ≥ 3:1 contrast against adjacent colours, never removed, visible in `forced-colors` | Gate |
| NFR-A-05 | Target size | ≥ 24 × 24 CSS px for every interactive control, with ≥ 44 × 44 px for primary controls in the default theme | Gate |
| NFR-A-06 | Reflow | No horizontal scrolling at 320 px width or 400% zoom at 1280 px | Gate |
| NFR-A-07 | Keyboard | 100% of interactive elements reachable and operable; 0 keyboard traps; radio groups use roving tabindex | Gate |
| NFR-A-08 | Live-region announcements per user action | ≤ 1 coalesced announcement; announcement latency ≤ 500 ms after state change | Target |
| NFR-A-09 | Known accessibility gaps published | complete and dated; 0 undisclosed known failures | Published |

**ASSUMPTION: NFR-A-02's specific pairs, NFR-A-05's 44 px primary target, NFR-A-08's numbers.** WCAG 2.2 AA itself is confirmed from the brief. Note that automated tooling catches roughly a third of real issues — NFR-A-02 is not optional padding, it is the part that makes NFR-A-01 honest, and the README should say so rather than implying the automated gate is sufficient.

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
| NFR-U-01 | Time from `npm install` to a rendered, working form following the quickstart | ≤ 5 minutes; ≤ 10 lines of consumer code | Published |
| NFR-U-02 | Lines of code to match a host design system via tokens | ≤ 30 lines of CSS, 0 JavaScript | Published |
| NFR-U-03 | Configuration options on the top-level component | ≤ 12, each documented with default and rationale | Target |
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
| NFR-I-06 | Multi-language questionnaires | `Questionnaire.item.text` translation extensions — **out of scope for v1, stated in the conformance matrix** | Published |

**ASSUMPTION: NFR-I-02's key count and NFR-I-06's exclusion.** NFR-I-06 is worth a second look: a regulated clinical buyer operating in the EU may treat translation extensions as table stakes rather than a long-tail SDC feature. If so it moves into scope and the conformance matrix row becomes a supported row instead.

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
| NFR-M-06 | Lint rules encoding architectural constraints | ≥ 4 custom rules: no DOM in core, no network API anywhere, no hard-coded user-facing strings, no cross-package deep imports — plus the intra-core module import table of `05-architecture.md` §4.1 row by row, and ADR-0020's pair: `Intl` allowed only under `view/format`, and no `toLocale*` or other ambient-locale call anywhere in core | Gate |
| NFR-M-07 | CI wall-clock time for the blocking PR pipeline | ≤ 10 minutes p95; fast feedback subset (type-check + lint + core unit) ≤ 3 minutes | Target |
| NFR-M-08 | Commit and PR hygiene | conventional commits; every PR links to a story or ADR; 0 direct pushes to the default branch | Published |
| NFR-M-09 | Maintenance mode response commitment | **none stated publicly** — issues triaged monthly, security reports per NFR-X-08, no SLA on features or questions; stated in the README so no support expectation is created | Published |

**ASSUMPTION: NFR-M-02/03/05/07 numbers and the monthly triage cadence in NFR-M-09.** NFR-M-09 is deliberately a *non*-commitment, and stating it plainly is the mitigation for Brief §1's second failure condition — the project growing a support obligation its maintainers cannot sustain.

---

## 10. Project constraints carried from the brief

These are not build gates but they bound every decision above.

| ID | Constraint | Number | Source |
|---|---|---|---|
| NFR-Z-01 | Main build effort | 3–4 weeks at a sustainable part-time pace — **ASSUMPTION: 12–15 hours per week, so roughly 40–60 hours total. Brief §8 explicitly asks for this to be confirmed before milestone planning; every scope decision hangs on it** | Brief §8 |
| NFR-Z-02 | Completeness | 0 layers shipped in a partial state; there is no phase two to defer to | Brief §5, §8 |
| NFR-Z-03 | Defensibility | 100% of decisions arguable unaided by the maintainer | Brief §8 |
| NFR-Z-04 | Licence | Apache-2.0, for the explicit patent grant the primary user's legal team looks for — **recommendation confirmed; Brief §9.2 asked for confirmation** | Brief §9.2 |
**Effort reality check.** NFR-Z-01 is the riskiest number in either document. Taken at face value, 40–60 hours must absorb: a rules engine with mutation-tested correctness, four packages, a web component, four customization tiers, a WCAG 2.2 AA-verified default UI, a playground, a docs site, twenty ADRs and a CI pipeline with twenty-one blocking gates. If the confirmed budget is at the lower end, the honest cuts in priority order are: NFR-Q-03 mutation testing scope → E12 US-12.4/12.5 playground extras → the print stylesheet → NFR-A-02 reduced to two screen reader pairs. Cutting docs, ADRs or accessibility instead would remove the exact evidence adopters need to verify the principles in Brief §6.

---

## 11. Assumption register

Every number in this document that the brief did not fix. Correct these before milestone planning.

| # | Ref | Assumed value | Why it matters |
|---|---|---|---|
| N1 | §0 | 2-core CI runner + 4× throttled mobile as reference hardware | All timing figures are meaningless without it |
| N2 | NFR-P-01…09 | All performance figures | Anchor to real instrument sizes; challenge the 1,000-item ceiling first |
| N3 | NFR-S-02/03/04 | Core ≤ 14 kB, view ≤ 5 kB, react ≤ 6 kB (excl. React, core and view), element ≤ 24 kB, `base.css` ≤ 4 kB, theme preset ≤ 3 kB, IIFE ≤ 30 kB | Published competitive claim; re-baseline after the engine spike |
| N4 | NFR-S-06 | ≤ 40 direct dev dependencies | Soft; keeps the dev toolchain small enough to audit, not a hard constraint |
| N5 | NFR-C-01 | Last 2 browser versions, iOS Safari 16.4+ | Lowering this costs bundle size |
| N6 | NFR-C-02 | The six consumer environments | Each one added costs CI time |
| N7 | NFR-C-06 | TypeScript ≥ 5.4 consumer floor | Too high excludes conservative enterprise toolchains |
| N8 | NFR-Q-01/02 | 95%/90% core, 85%/80% adapters | |
| N9 | NFR-Q-03 | 80% mutation score on engine modules | Highest-cost gate, and the strongest correctness evidence |
| N10 | NFR-Q-06 | 1,000 generated round-trip cases per run | Trades CI time for correctness confidence |
| N11 | NFR-A-02 | Three screen reader/browser pairs per release | Manual effort per release, recurring |
| N12 | NFR-A-05 | 44 px primary targets above the 24 px AA floor | Affects default theme density |
| N13 | NFR-A-08 | ≤ 1 announcement per action, ≤ 500 ms | |
| N14 | NFR-X-05 | ≥ 20-vector XSS payload corpus | |
| N15 | NFR-X-08 | 7-day acknowledge / 30-day patch | A public commitment; keep it conservative given NFR-M-09 |
| N16 | NFR-X-09 | **Resolved 2026-09-15:** no analytics; CSP `connect-src 'none'` (AT4) | No longer an assumption |
| N17 | NFR-U-01…07 | All integration-effort figures | NFR-U-05's 60-symbol API cap is the one to hold |
| N18 | NFR-I-02 | ≤ 45 message keys | |
| N19 | NFR-I-06 | Translation extensions excluded from v1 | May be table stakes for an EU clinical buyer — reconsider |
| N20 | NFR-M-02/03 | Complexity ≤ 15, file ≤ 400 lines | |
| N21 | NFR-M-05 | ≥ 10 ADRs, list as given | The list itself is the real assumption |
| N22 | NFR-M-07 | ≤ 10 min CI, ≤ 3 min fast feedback | |
| N23 | NFR-M-09 | Monthly issue triage | Deliberately minimal; protects Brief §1 |
| N24 | NFR-Z-01 | 12–15 hrs/week → 40–60 hours total | **Confirm first. Brief §8 says the whole plan hangs on it** |

---

## 12. Open questions returned to product

Carried from Brief §9, with a BA position on each; later additions are marked *New*. All are decidable now. Rows 1–8 block milestone planning; row 9 blocks M5.

| # | Question | Position |
|---|---|---|
| 1 | Demo questionnaire | Original "pre-visit intake" fixture per AC-15.1.3; PHQ-9 kept as a flat secondary fixture for scoring docs. **Confirm** |
| 2 | Licence | Apache-2.0. **Confirmed as recommended, no objection from analysis** |
| 3 | Naming / brand | Defer past launch as the brief proposes. A brand name adds no evidence for any principle in §6 |
| 4 | Accessibility target | WCAG 2.2 AA, verified per §5 — automated gate in CI plus a published dated manual record. **Confirm the three screen reader pairs** |
| 5 | Reference backend | **Drop.** Serves no principle in §6, adds a Docker surface and a thing that can break on an evaluator's machine |
| 6 | Scoring extension point | Extension point in core (US-07.2); PHQ-9/GAD-7 as documented example and test fixture, not a published package. **Confirm** |
| 7 | *New* — effort budget | NFR-Z-01. Confirm hours per week before milestones are drawn |
| 8 | *New* — playground analytics | NFR-X-09. **Resolved 2026-09-15: none** (`05-architecture.md` §9 AT4) |
| 9 | *New* — default locale | ADR-0020 settled the mechanism: `view/` formats, the locale is an explicit presentation option. What remains is product's: which locale the packages default to, and whether NFR-I-03's single built-in locale (en) serves a buyer operating outside English. **Confirm** |
