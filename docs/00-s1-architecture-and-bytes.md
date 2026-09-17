# S1 — Architecture B and byte budgets

*Spike for M1 (`06-roadmap.md` §3). Timebox 12 h. Question: can one semantic view model drive both renderers accessibly, and what do the layers actually weigh? Output: measured bytes per entry point, an extrapolation with its method and error bars (M1 AC-1), the evidence for AC-3 to AC-8, and the inputs to the budget verdict (AC-2, `03-nfr.md` N3) and the go/no-go note (AC-9, `05-architecture.md` §11).*

**Run date:** 2026-09-16. **Slice:** a `boolean` that gates a required `string` (`packages/core/test/slice.ts`).

---

## 1. What was built

| Layer | Files | What it proves |
|---|---|---|
| Engine | `packages/core/src/{kernel,definition,session,validation}/`, `index.ts` | `createSession(DefinitionInput)`; `SetAnswer`, `ClearAnswer`, `NoteItemLeft`, `RequestCompletion`; enablement settled by a naive full pass; one notification per visible cycle; stable `getSnapshot`; refusals as no-op cycles with a reason; SM-03 quiet → live; refused and accepted completion. 27 Node tests. |
| View | `packages/core/src/view/` | `createView(session, { idPrefix })`: nodes with the four ids, `required`, `invalid`, surfaced issues, value and bound `set`/`clear`/`leave`; the cycle's announcement; the error summary; the focus target; unchanged nodes keep identity. 19 Node tests, including the AC-3 deny-list test. |
| Themes | `packages/themes/src/{base,default}.css`, `index.ts` | 23 tokens, logical properties only, light and dark. 5 Node tests hold both files to the token list. |
| Element | `packages/element/src/` | `<fhir-questionnaire>` with an open shadow root, a keyed patcher, adopted constructable stylesheets, a polite live region and focus to the summary. Lint bans every inline-style route: 10 must-fail cases and one must-pass. |
| React | `packages/react/src/` | `<Questionnaire session>` over `useSyncExternalStore`, `useId`-prefixed ids, `memo` per item path, focus and announcements in effects. SSR to string in Node on React 18 and 19. |
| Harness | `scripts/measure-bundles.mjs`, `scripts/budgets.json` | The budget gate's script: esbuild metafile, gzip, per-module bytes, `node_modules` inputs flagged, `--check` mode. 7 Node tests. |
| Browser proofs | `tests/browser/`, `playwright.config.ts` | Contract, axe, hydration, caret, CSP — §4. |

**Decisions this ran under.** D1–D8 of the M1 plan, recorded in `06-roadmap.md` §3 M1. The spike's exports are `@alpha` and unpublished (D1). Sessions are built from hand-written `DefinitionInput` (D2). The slice's eleven messages sit at the catalogue's path, `en` only, no override or fallback (D3). No fixture pair for `enableWhen` in M1 (D7).

## 2. Measured bytes (AC-1)

`pnpm measure` on the finished slice. esbuild, minified, ES2022; gzip level 9; 1 kB = 1,000 bytes. Each figure is measured the way NFR-S-02 defines it.

| Entry point | What is in it | Minified | Gzip | Budget |
|---|---|---:|---:|---:|
| `@fhirq/core` | the engine | 3.92 kB | **1.76 kB** | 14 kB |
| `@fhirq/core/view` | the view, excluding core | 3.58 kB | **1.55 kB** | 5 kB |
| `@fhirq/react` | excluding React, core and view | 3.32 kB | **1.19 kB** | 6 kB |
| `@fhirq/element` | standalone: element, core, view, embedded theme | 16.28 kB | **5.84 kB** | 24 kB |
| `@fhirq/element` IIFE | the element defined, plus `createSession` | 16.70 kB | **6.03 kB** | 30 kB |
| `@fhirq/themes/base.css` | | 2.34 kB | **0.65 kB** | 4 kB |
| `@fhirq/themes/default.css` | | 0.93 kB | **0.34 kB** | 3 kB |

No entry has a `node_modules` input (NFR-S-01).

**Two measurement choices, both deliberate.** First, under D2 the element takes a host-created session and reaches no engine code of its own, so its standalone figure bundles `createSession` explicitly: NFR-S-02 counts core in it, and from M7 the element creates sessions itself. Second, the embedded stylesheets are minified by esbuild before being inlined as strings, as the element's real build must do; inlined raw, `base.css` weighed 3.19 kB minified instead of 2.35 kB.

**Concatenation matters.** Gzipped one module at a time, the element's inputs sum to 7.76 kB; gzipped as the one bundle they ship as, 5.84 kB, 25 % less. Every figure below is computed on whole bundles, never by summing per-module gzip.

Per-module minified bytes for every bundle are in the generated `reports/bundle-sizes.md` (CI artifact `spike-proofs`).

## 3. Extrapolation to the full feature set (AC-1)

Two slices extrapolate to 1,000-item instruments only through a model, and the model is where the error is. Decision D8 chose to run two independent methods and publish the wider band.

### 3.1 Method (a): marginal cost per concept

Each layer's full scope (M2–M7 as written in `06-roadmap.md` §3, with counts from `02-requirements.md` and `04-domain.md`) is broken into concepts. Each concept gets a low–high minified-byte range anchored on what the nearest slice concept measured: the slice's session shell and four commands (≈ 2.0 kB together), its four load checks (≈ 0.4 kB, ≈ 100 bytes each), its one validation rule (132 bytes), its two view node builders (≈ 0.7 kB), its two element patchers (≈ 2.0 kB), its eleven messages (612 bytes).

| Layer | Concepts and counts in scope | Minified, low–high |
|---|---|---:|
| Core | session shell; 7 commands; repeats with ordinals and positions (SM-05); dependency graph, ranks and recompute set (ADR-0009); 7 operators × 6 comparison families; retention and `discard` reset (SM-02); surfacing and completion; option resolution (SM-04); INV-D-01…15 with cycle naming; 9 validation rules and the cross-field runner; scoring and evaluator wiring; R4 parse of 12 item types and 13+ extensions in two load modes; emit; hydrate with drift, orphans and quarantine; snapshot and restore; kernel | 18.9–35.5 kB |
| View | model builder and identity; 14 control kinds; groups, repeat metadata and the inert add; announcements and coalescing; summary with form-level issues and focus targets; `Intl` formatting and its cache (ADR-0020); ids; a 45-key catalogue with override and fallback; option state and retry | 9.1–17.0 kB |
| React | hook, component and the controlled-by-response protocol; 14 control kinds; groups and repeats; summary, status and focus effects; tier-3 mapping | 5.8–10.8 kB |
| Element renderer | shell, properties, lifecycle, events, locale; 14 patchers; keyed repeat instances; summary, status and focus; default resolver; tier-3 overrides; DOM utilities | 13.0–22.6 kB |
| Embedded theme | full `base.css` (7–12 kB) and the default preset (2.5–4 kB) | 9.5–16.0 kB |

### 3.2 Method (b): bytes per source line

The slice's measured minified bytes per source line (types and all, comments and blank lines excluded) — core 12.4, view 13.9, React 21.8, element 18.6 — times an estimate of each layer's full size in the same kind of lines: core 1,980–3,340, view 1,000–1,700, React 600–1,000, element 1,100–1,800. The theme is carried over from method (a).

### 3.3 From minified to gzip

Compression improves as a bundle grows, so a fixed ratio would bias every estimate. The ratio band is read from 36 third-party ES bundles measured the same way (esbuild minify, gzip 9) plus the slice's own bundles:

| Minified size | Observed gzip ratio | Band used |
|---|---|---|
| < 12 kB | slice 0.36–0.45; libraries 0.21–0.59, most 0.33–0.45 | 0.33–0.42 |
| 12–30 kB | slice 0.36; libraries 0.27–0.36, plus one outlier at 0.47 that embeds base64 | 0.28–0.38 |
| 30–60 kB | 0.25–0.33 | 0.25–0.34 |
| > 60 kB | 0.18–0.30 | 0.22–0.31 |

Low bound = low bytes × low ratio for that size; high bound = high bytes × high ratio.

### 3.4 Bands

| Entry point | Budget | Method (a) | Method (b) | **Published band** | Central (a) / (b) |
|---|---:|---:|---:|---:|---:|
| `@fhirq/core` | 14 kB | 5.3–12.1 kB | 6.9–14.1 kB | **5.3–14.1 kB** | 9.0 / 9.7 kB |
| `@fhirq/core/view` | 5 kB | 3.0–6.5 kB | 3.9–9.0 kB | **3.0–9.0 kB** | 4.3 / 6.2 kB |
| `@fhirq/react` | 6 kB | 1.9–4.5 kB | 3.7–8.3 kB | **1.9–8.3 kB** | 3.1 / 5.8 kB |
| `@fhirq/element` | 24 kB | 12.6–28.2 kB | 15.0–35.5 kB | **12.6–35.5 kB** | 18.8 / 24.2 kB |
| IIFE (element + 0.2 kB) | 30 kB | 12.8–28.4 kB | 15.2–35.7 kB | **12.8–35.7 kB** | 19.0 / 24.4 kB |
| `base.css` | 4 kB | | | **1.8–3.8 kB** | |
| default preset | 3 kB | | | **0.7–1.3 kB** | |

"Central" is the midpoint of the byte range at the midpoint ratio for that size.

### 3.5 Error sources, largest first

1. **Scope counts are estimates.** Every concept range and line count is a judgement about code that does not exist. This dominates everything below; it is why each published band's high edge is roughly three times its low edge.
2. **Byte density differs by kind of code.** Type-only lines emit nothing; JSX emits more per line than plain code (21.8 against 12.4 bytes per line); message strings compress poorly (0.45). Method (b) assumes the full layers keep the slice's mix.
3. **Spike density is not production density.** The slice has no defensive branches for lenient mode, no diagnostics beyond one code and no development-only checks. That biases toward the low edge.
4. **The gzip ratio band** is observed on other people's code; the kit's code is class-and-attribute-string heavy, which compresses slightly better than typical.
5. **Tree-shaking is assumed away.** The element is charged all of core. If the element never reaches hydrate or snapshot, that is 2.2–4.0 kB minified it does not carry (§3.6).

### 3.6 Reductions named before they are needed

In the order they cost least in promises, with their estimated effect on the element's gzip figure:

1. **The element reaches no hydrate, snapshot or restore code.** Keep those modules side-effect-free and outside the element's import graph: −0.6 to −1.2 kB. No ADR.
2. **Table-driven patchers.** One control descriptor table interpreted by one patcher, instead of fourteen hand-written builders: −0.8 to −1.7 kB, at some cost in readability. No ADR.
3. **The theme is not embedded** — the option ADR-0014 and NFR-S-02 name. −2.5 to −5.1 kB, but it breaks the one-script-tag promise under `style-src 'self'` and would need an ADR amending ADR-0014 and NFR-S-02.

Reductions 1 and 2 bring the element's high edge from 35.5 to about 32.6 kB; with 3, to about 28. **No named route brings the pessimistic edge under 24 kB. Every central estimate is inside it without any of them.**

## 4. The other acceptance criteria

All run locally on 2026-09-16: `pnpm test:browser`, **40 passed, 30 skipped by design** (engine-independent specs run on Chromium only), 29 s wall-clock on one machine. The CI job `spike-proofs` runs the same suite and uploads the bundle report. **Its first run on GitHub Actions** (2026-09-17, `ubuntu-latest`, run 35177552910) **took 1 min 39 s**, with the same 40 passed and 30 skipped: browser install 45 s, bundle report 1 s, browser proofs 33 s, artifact upload 1 s, and the rest setup (checkout, Node, pnpm, a cached install) at about 19 s. Installing the two browsers costs more than running every proof. That is the first reading for R7's browser lanes: they are not required checks and are outside NFR-M-07's fast lane.

| AC | Proof | Result |
|---|---|---|
| 3 View field list | `packages/core/test/view-fields.test.ts` walks every key the view produces in five states against HTML element, ARIA attribute and CSS property deny-lists | Passes. Two coincidences allowed, each named by an accepted ADR: `label` and `clear` (§5) |
| 4 One contract | `contract.spec.ts`: for each of three states, the element's and React 19's trees compared node for node — classes, `part`, roles, ARIA attributes with every id reference resolved in its own root, input state — and their ARIA snapshots | Identical in all three states |
| 5 Accessibility | `a11y.spec.ts`: axe, WCAG 2.0/2.1/2.2 A and AA, 2 renderers × light/dark × 375/1280 px × 3 states = 24 runs; plus a control that plants an unlabelled input in the shadow root and expects axe to report it | 0 violations in 24 runs; the control is caught |
| 6 SSR and hydration | Node: `renderToString` on React 18 and 19, no DOM globals, no console output. Browser: `hydration.spec.ts`, development builds of each major, interaction through a refused completion and a fix; fails on any console warning or error, and on any removal of the server-rendered form node | 0 warnings, 0 errors, server markup adopted, on both majors |
| 7 Caret and focus | `caret.spec.ts`, Chromium and WebKit: typing at the end one cycle per keystroke; inserting mid-string; a cycle that flips the input's own `aria-invalid` both ways. Each asserts the same node keeps focus and `selectionStart` | Pass on both engines. A mutation that rebuilds changed nodes fails all three |
| 8 CSP | `csp.spec.ts`, Chromium and WebKit, `default-src 'self'; script-src 'self'; style-src 'self'`: 0 violations, 0 `<style>`, 0 `style` attributes, 0 `.style` writes (instrumented before any page script), 2 adopted sheets, token-derived computed styles present; plus a control proving the policy blocks an inline sheet and the instrumentation counts writes | Pass on both engines |

## 5. Findings

1. **ADR-0020's `display` field fails ADR-0007's review rule as written.** ADR-0020 has every view node carry `value` and `display`; `display` is a CSS property, and ADR-0007's checklist fails any field that names one. Both are Accepted. M1 has no `display` field, so nothing here picks a side. M5 needs one of: rename the field, or amend the rule to "names *markup or styling*". **Open, for the maintainer.**
2. **`label` and `clear` coincide with the deny-lists too,** and are ADR-0007's own names (and ADR-0013's `ControlProps`). The test allows exactly those two, with the reason written beside each, so the AC-3 reviewer sees them rather than a silent pass. A view issue's `code` was renamed `rule` for the same reason (`<code>`).
3. **`useId` requires the *same tree*, not the same form.** The first hydration run failed on both majors: the test client wrapped the form in a fragment with a readiness component the server did not render, and every id shifted. The fix was the harness's. It is the mismatch ADR-0015 predicts, and it will be the first thing an integrator's Next.js layout trips on; M6's docs should say so.
4. **Native same-name radios give the roving tab stop and arrow keys** NFR-A-07 asks for, at no byte cost. D6's premise that yes/no radios cost bytes for roving tabindex did not hold, so the byte figures carry no hand-written roving code.
5. **Leaving an item is decided in the renderers.** Both check whether focus moved to somewhere inside the same item before calling `leave`. It is DOM containment, which `view/` cannot see, and it is duplicated. It is the one piece of behaviour in the renderers today; M5 should decide whether the contract states it or the view offers a helper.
6. **The view budget is the likeliest first overrun,** not the element's. Its band straddles 5 kB and method (b)'s centre is over it. The 45-key `en` catalogue alone is roughly 1 kB gzipped of the 5.

## 6. Kill criteria

| Criterion | Status |
|---|---|
| The element extrapolates past 24 kB with no route back inside it | **Not triggered, not retired.** The low edge (12.6 kB) and both centres (18.8, 24.2 kB) are at or under 24 kB. The high edge (35.5 kB) is over, and the named reductions (§3.6) do not bring it back. |
| The view model needs element names, ARIA attribute literals or CSS properties | **Not triggered.** The deny-list test passes; both renderers were served by semantic fields. Finding 1 is a naming conflict between two ADRs, not a need. |
| Hydration warnings cannot be removed without client-only rendering | **Not triggered.** 0 on React 18 and 19, with server markup adopted. |

## 7. Timebox

Step-by-step hours were not logged in a form that can calibrate P1, so this spike does not recalibrate the effort figures; M2's 30 hours is P1's first real reading. Steps 1–4 were complete before the 6-hour checkpoint, so step 7's matrix was not cut.

## 8. Not covered

R4 parsing; the dependency graph and incrementality; repeats, options, hydration and snapshots; ports; the catalogue's override and fallback; `Intl` date and number formatting; tiers 2–4; Firefox (M7); the axe matrix beyond Chromium (M8); screen-reader passes; the fixture pair and conformance row for `enableWhen` (D7); coverage and mutation gates, not measured here (coverage tooling is not installed); `pnpm build` and `dist`; the playground; `docs/07-api.md` and the API report (D1). React 18 was proven in development builds only; production builds do not print hydration warnings.

## 9. Reproducing this

```sh
pnpm install
pnpm exec playwright install chromium webkit
pnpm measure          # writes reports/bundle-sizes.{json,md}
pnpm test             # Node: engine, view, themes, SSR on React 18 and 19, the measurement script
pnpm test:browser     # contract, axe, hydration, caret, CSP
```
