# FHIR Questionnaire Kit — Roadmap

*Phase: delivery planning. Input: `05-architecture.md` (with `01-brief.md`, `02-requirements.md`, `03-nfr.md`, `04-domain.md` and ADR-0001–0019). Output: milestones ordered so the riskiest unknown is proven first, each with goal, scope, out-of-scope, acceptance criteria and its spike. Next: build.*

**Status:** Accepted, 2026-09-16. §6's fifteen decisions are closed (see §6 and `00-m0-decisions.md`), which is what M0 gated on. NFR-Z-01 is restated at ≈ 184 hours, 13–15 weeks, and §7's cut ladder is declined in writing and held in reserve.

---

## 0. How to read this document

**Ordering rule.** Milestones are ordered by *unknown × blast radius*, not by layer order or by what is pleasant to build. A thing that is merely hard (the evaluation engine) ranks below a thing that is unknown and would invalidate an accepted decision (whether one presentation model can drive two renderers inside the published byte budgets). §1 ranks the risks; §2 maps each to the milestone that retires it.

**Milestone done** means the repo definition of done holds *for that milestone's scope*: typecheck, lint and tests pass; the conformance fixtures that exist pass; the budgets that are measurable hold; `docs/07-api.md` and the API report match the public surface; a changeset exists if the public API moved; docs and ADRs are updated if behaviour changed; and the milestone's own acceptance criteria below are individually demonstrable.

**Gate ladder.** A CI gate is switched to blocking in the milestone that first produces the code it guards, never earlier (§5). A gate that is red because its subject does not exist yet teaches the team to ignore red.

**Vertical where possible.** M1 is a deliberate vertical slice through all four layers. M2–M5 are horizontal, because ADR-0007 concentrates each behaviour in exactly one layer — that concentration is the architecture's benefit and its scheduling cost. M1 exists so the horizontal stretch is entered with the layering proven rather than assumed.

**Effort figures** are `ASSUMPTION:` throughout and are collected in §7. They are hours of focused build time by one maintainer who already holds this design in their head.

**Traceability.** Every milestone names the epics (`02-requirements.md`), NFRs (`03-nfr.md`), invariants (`04-domain.md`) and ADRs it discharges. §8 proves that every epic E01–E15 lands somewhere, which is what NFR-Z-02 ("nothing ships partial") requires of a plan.

---

## 1. Risk register, ranked

Ranked by how much is genuinely *unknown* multiplied by how much would have to be rebuilt if the answer is bad. An item that is hard but fully specified is not a top risk: ADR-0009 tells us exactly what to build, so the engine's risk is schedule, not direction.

| # | Risk | Why it is an unknown | What a bad answer invalidates | Retired by |
|---|---|---|---|---|
| **R1** | **The element's byte budget is arithmetically tight.** NFR-S-02 gives `@fhirq/element` ≤ 24 kB *standalone, including core, view and the default theme*. Core alone is budgeted at 14 kB and view at 5 kB, so 19 kB is committed before a single line of DOM code or a single byte of embedded CSS (ADR-0014 embeds `base.css` plus a preset as strings). | Every byte figure is flagged `ASSUMPTION` (N3) and `03-nfr.md` §2 says explicitly to re-baseline *after the engine spike*. Nobody has measured a line of this code. | The published competitive claim (Brief §4), possibly NFR-S-02 itself, possibly ADR-0014's decision to embed the theme in the bundle. | **M1** (measure), **M7** (hold). **Measured by S1 on 2026-09-16, not retired:** the element's extrapolated band is 12.6–35.5 kB and the view's 3.0–9.0 kB, both straddling their budgets. Open until the budget gates read real code, core first at M2 (`00-s1-architecture-and-bytes.md`). **Core's M2 reading tripped `03-nfr.md` §2's tripwire (2026-09-17); ADR-0021 holds the budgets by moving resume code to `@fhirq/core/resume` (M3), then, on measured readings, table-driven patchers (decided at M5) and an element-figure amendment (decided at M7)** |
| **R2** | **View-model sufficiency.** Architecture B is accepted on the claim that a DOM-free semantic view model can carry every BC6 behaviour — ids, ARIA state, announcements, error summary, focus targets, the tier-3 contract — for both a React renderer and a keyed vanilla renderer, without becoming a virtual DOM (ADR-0007's own named risk). | It has never been written. The failure mode is gradual: fields named after elements, then a tree of them, then a renderer that cannot skip unchanged nodes. | ADR-0007 — the accepted architecture. Falling back to Architecture A doubles BC6 (its rejection reason) and moves that code under the weaker NFR-Q-02 gate. | **M1** (proof of concept), **M5** (full). **Proven on two control kinds by S1, 2026-09-16:** one contract, no markup-named fields; go/no-go *continue*, approved 2026-09-17 (`05-architecture.md` §11) |
| **R3** | **Retired 2026-09-16. Effort budget.** NFR-Z-01 assumed 40–60 hours for everything below, and Brief §8 asked for confirmation "before milestone planning". §7 estimated roughly three times that; the number moved to ≈ 184 h and the cut ladder was declined in writing. | The number was never confirmed. It is the only input on which every scope decision hangs (N24). | The shape of the release, via the cut ladder in `03-nfr.md` §10. Cutting after building is waste; cutting now is planning. | **M0** (decision), §7 (cut ladder) |
| **R4** | **Keyed DOM patching that never disturbs focus or caret.** ADR-0007 requires the element to patch, not rebuild; ADR-0014 forbids `<style>`, inline styles and `el.style`; `adoptedStyleSheets` must work at the iOS Safari 16.4 floor (A4). | Hand-written patching against a live, focused form is the classic source of subtle input bugs, and the CSP and shadow-DOM constraints remove the usual escape hatches. | The element's default UI, NFR-A-07, NFR-P-03, and A4's browser floor. | **M1** (thin proof), **M7** (full) |
| **R5** | **React SSR with zero hydration warnings on 18 *and* 19,** with `useSyncExternalStore`, `useId`-prefixed ids and pending option state rendered identically on server and first client render (ADR-0015). | Two React majors, two id strategies to keep aligned, and a gate that fails the build on any console warning (AC-08.3.2). | NFR-C-08, AC-08.3.1/2, and ADR-0015's "SSR by construction" claim. | **M1** (thin proof), **M6** (full) |
| **R6** | **Retired 2026-09-17. Incremental evaluation correctness at scale.** Tarjan, topological ranks, scope-resolved edges inside repeat instances, single-writer queue, per-node object identity, and a recompute set asserted against an independent BFS closure (ADR-0009, NFR-P-09). | Hard, but *specified*. The unknown is only whether the performance figures (N2, themselves assumptions) survive contact with the scale ceiling. | Performance NFRs and the benchmark baselines — not the architecture. | **M2. Retired 2026-09-17:** incremental state equals an independent from-scratch oracle, and the traced recompute set equals an independent BFS, over generated questionnaires with nested repeats and at the 1,980-node ceiling. The figures survived the ceiling: 500-item creation 1.1–2.0 ms and a depth-5 cascade 0.05–0.08 ms on the runner, 2.1 MB retained heap. What stays open is the benchmark *gate*, not correctness (M2 AC-9) |
| **R7** | **The CI pipeline's own budget.** Twenty-one blocking gates (§5), three browser engines, mutation testing, 1,000 property cases, six consumer environments, all inside 10 minutes p95 (NFR-M-07, A6). | Measurable only once real code and real suites exist. | NFR-M-07 (a target, not a gate) and the merge experience; the documented relief valve is moving WebKit to nightly (ADR-0018). | **M2** (first measurement), **M11** (full pipeline). **First reading 2026-09-17:** the blocking PR pipeline runs in about 3 min wall-clock — fast lane 36–40 s, engine gates 25 s, incremental mutation 2 min 50 s. Mutation briefly took 5 min 26 s, over S2's K1, and was relieved inside the lane rather than by moving WebKit (`00-s2-mutation-cost.md` §7). The runner has 4 cores, recorded as N1's reference |
| **R8** | **Accessibility at full breadth.** 0 violations across demo forms × 4 tiers × 2 themes × 2 viewports × 2 renderers, plus contrast, target size, reflow, forced-colors and RTL (NFR-A-01…09). | Automated tooling catches roughly a third of real issues (`03-nfr.md` §5), so the residue surfaces only in manual passes, which are late and manual. | Brief §6 principle 4 and the claim the primary user checks hardest. | **M1** (one control, both renderers), **M8** (full) |
| **R9** | **Retired 2026-09-16, with one figure carried forward. Performance anchors.** NFR-P-04's 1,000-item / 500-condition ceiling and NFR-P-05 are confirmed against 300 surveyed instruments; the 50-instance figure is not evidenced by any `Questionnaire` and moves to M2. | A survey of real instrument sizes has now been done (`00-s0-instrument-survey.md`). | Benchmark design, heap budget NFR-P-08, and possibly NFR-P-01/02's anchors. | **M0** (spike S0) |

**Why the engine is not first.** R6 is the largest *block of work* and the actual product, but it is the best-specified thing in the repository: ADR-0009 names the algorithm, the data structures, the cycle steps and the verification. Building it first would spend the biggest block of the budget before learning whether the layer it must publish into (R2) and the size envelope it must fit (R1) are real. M1 buys those answers for roughly a tenth of M2's cost.

---

## 2. Milestone map

| # | Milestone | Goal in one line | Retires | Depends on | Effort (ASSUMPTION) |
|---|---|---|---|---|---|
| **M0** | Preconditions, decisions and skeleton | Close every decision that would change what gets built; stand up the workspace and the fast lane | R3, R9 | — | 6 h |
| **M1** | Vertical-slice spike | Prove architecture B end to end on two items, and re-baseline the byte budgets from measurement | R1, R2 (proof), R4/R5/R8 (thin) | M0 | 12 h |
| **M2** | Engine I — definition and evaluation | The rules engine: compile, cascade, retain, repeat, notify | R6, R7 (first read) | M1 | 30 h |
| **M3** | Engine II — validation, projection, interchange | One visible projection; emit, snapshot, hydrate, restore | — | M2 | 24 h |
| **M4** | Ports and the safety boundary | Host collaborators, and the no-network/no-storage claim made mechanical | — | M3 | 10 h |
| **M5** | Presentation model | All of BC6 that is not markup, written once, tested in Node | R2 (full) | M3 (M4 for options state) | 16 h |
| **M6** | React adapter | Tiers 1–4 in React, SSR-safe, controlled and uncontrolled | R5 (full) | M5 | 16 h |
| **M7** | Element and script-tag embed | `<fhir-questionnaire>` in shadow DOM, keyed patcher, default resolver, IIFE | R1 (hold), R4 (full) | M5 | 20 h |
| **M8** | Themes and accessibility completion | Tokens, presets, print, and every accessibility gate at full breadth | R8 (full) | M6, M7 | 16 h |
| **M9** | Playground | STK's entire evaluation, static and connection-free | — | M6, M8 | 12 h |
| **M10** | Docs, conformance matrix, adoption pack | EVL's 15–40 minutes | — | M8 (M9 for links) | 14 h |
| **M11** | Release engineering and 1.0.0 | Every gate blocking, every artifact signed, lockstep publish | R7 (full) | M9, M10 | 8 h |

---

## 3. Milestones

### M0 — Preconditions, decisions and skeleton

**Goal.** Reach the point where no decision that would change *what gets built* is still open, and where a trivial change can travel through a green fast lane. Everything in §6 closes here. `05-architecture.md` §8 leaves A3–A6 proposed, ADR-0008–0020 proposed, and ADR-0009 carries a follow-up that says in terms that it "needs acceptance before build" — building over that is building over an unresolved ADR, which the repository rules forbid.

**Retires.** R3 (effort budget), R9 (performance anchors).

**Scope.**
- Close every open decision in §6: the effort budget (N24), the demo fixture shape (R9 of the requirements register, AC-15.1.3), the screen-reader pairs (N11), the scoring example's shape (R7), the reference-backend drop (R10), assumptions A3–A6, AT5's disposition, and ADR-0009's calculated-item ordering follow-up.
- Move ADR-0008–0020 from Proposed to Accepted, or revise them. Update `docs/adr/README.md` statuses and dates.
- Scaffold the workspace from `05-architecture.md` §6 and the layout in the repository instructions: pnpm workspaces; `packages/core`, `packages/react`, `packages/element`, `packages/themes`; `apps/playground`; `fixtures/`.
- TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, target ES2022 (NFR-C-06); ESLint with the four NFR-M-06 architectural rules written but pointed at a near-empty tree; Vitest; Changesets in fixed mode; Apache-2.0 `LICENSE` and `NOTICE` (NFR-Z-04); PR template linking a story or ADR, and branch protection on the default branch turned on as the milestone closes (NFR-M-08).
- CI fast lane only: install from cache, typecheck, lint, core unit tests in Node.
- Spike S0 below.

**Out of scope.** Any package source beyond a placeholder entry point (M1 onwards). Budget, dependency, licence and packed-contents gates — they need code and an esbuild metafile to read (M1, M11). `docs/07-api.md` — it is created with the first public API in M2.

**Acceptance criteria.**
1. `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` all succeed from a clean clone, and the commands in the repository instructions exist in `package.json`.
2. The fast lane's measured wall-clock time is recorded; NFR-M-07's 3-minute figure is either met or restated with the measurement.
3. `docs/adr/README.md` lists no `Proposed` ADR that M1–M11 depend on, and each status change carries a date.
4. Every row in §6 has a recorded resolution with a date, in the document that owns it (`03-nfr.md` §11/§12, `02-requirements.md` §18, `05-architecture.md` §8/§9, or an ADR).
5. The confirmed NFR-Z-01 figure is written into `03-nfr.md`, and §7's cut ladder is either invoked or explicitly declined, in writing.
6. The four NFR-M-06 lint rules exist with unit tests over fixture files that must fail.
7. Branch protection is on as the milestone closes: the default branch refuses direct pushes, a PR with a passing fast lane is required, and the PR template links a story or ADR (NFR-M-08). M0's own scaffolding commits land before this, since the fast lane cannot gate the commits that create it.

**Spike.** **S0 — instrument-size survey.** Timebox 2 h, no code. Sample published FHIR Questionnaires from real instrument libraries and record item counts, condition counts, nesting depth and repeat usage. Output: either NFR-P-04's ceiling is confirmed, or N2 is re-anchored to observed sizes and NFR-P-01/02 move with it. Decision it unblocks: the shape of M2's benchmark fixtures, which get committed as baselines and are expensive to change later.

**Run on 2026-09-16; output `00-s0-instrument-survey.md`.** 300 instruments from two production libraries. The ceiling held — 1,000 items is the observed 99th percentile — and NFR-P-01/02's single 200-item anchor did not: the real distribution is bimodal and 200 sits in its trough. Both were re-anchored to 25-item and 500-item fixtures. The 50-repeat-instance figure is not evidenced by any `Questionnaire` and is carried into M2 as the one performance assumption still open.

**Effort.** ASSUMPTION: 6 h (of which S0 is 2 h; decision-closing time is the product owner's, not counted here).

---

### M1 — Vertical-slice spike

**Goal.** Answer the two questions that could invalidate the accepted architecture, by building the thinnest possible end-to-end slice and *measuring* it: does a DOM-free semantic view model actually carry BC6 for two renderers, and do the bytes fit? This milestone is explicitly a spike (S1). Its code may be kept, but no acceptance criterion assumes it will be.

**Retires.** R1 and R2 as decisions; R4, R5 and R8 as thin existence proofs.

**Scope.**
- A two-item questionnaire: a `boolean` that gates a `string`, plus the string's `required` rule. No repeats, no options, no hydration.
- Enough engine to serve it: hand-built `DefinitionInput` (permitted by ADR-0016 for engine tests), a session with `SetAnswer`, `NoteItemLeft`, `RequestCompletion`, settled enablement, one notification per cycle, `subscribe`/`getSnapshot` with stable references. No graph algorithms, no incrementality — those are M2.
- A `view/` module producing the real shape ADR-0007 specifies for these two nodes: control kind, label, the four ids, `required`, `invalid`, surfaced issues, bound commands, plus the cycle's announcement, error summary and focus target.
- Both renderers over that view model: a React component and a custom element with an open shadow root, a keyed patcher and `adoptedStyleSheets`.
- A first `base.css` with the tokens these two controls need, and the DOM contract written down (elements, roles, class names, `part` names).
- Measurement harness: esbuild with a metafile, gzip sizing per entry point, checked in as the script the budget gate will later use.

**Out of scope.** Correct `enableWhen` at any scale, cascading, repeats, validation beyond `required`, options, hydration, snapshots, ports, tiers 2–4, themes beyond a handful of tokens, docs, playground. Every one of these is a later milestone, and pulling any of them forward defeats the point of the spike.

**Acceptance criteria.**
1. Measured gzipped bytes are recorded per entry point, together with an extrapolation to the full feature set that states its method and its error bars. The element figure is measured **standalone, including core, view and the embedded theme**, exactly as NFR-S-02 defines it.
2. A written budget verdict exists: NFR-S-02 and N3 are either confirmed or amended by an ADR that names the new numbers and the reason. If the element budget cannot hold, the options named in ADR-0014 and NFR-S-02 are weighed *before* M2 starts, not after M7 discovers it.
3. The view-model field list passes ADR-0007's review rule: no field names an HTML element, an ARIA attribute literal or a CSS property. A reviewer's checklist entry records the pass.
4. Both renderers produce the same roles, accessible names, ARIA relationships, class names and `part` names for the two items, asserted by one contract test running against both.
5. Automated accessibility checks report 0 violations on the slice, in both renderers, light and dark, at 375 px and 1280 px.
6. React server-renders the slice to a string in Node with no DOM globals, and hydrates with 0 console warnings under React 18 **and** React 19.
7. Typing into the string item in the element does not lose focus or caret position across a re-render, asserted by a Playwright test that types, waits for a cycle, and asserts `selectionStart`.
8. The element renders under `script-src 'self'; style-src 'self'` with no `<style>` element, no `style` attribute and no `el.style` write, asserted in a CSP-restricted page; `adoptedStyleSheets` is exercised in WebKit.
9. A go/no-go note on Architecture B is appended to `05-architecture.md`: continue, or open the reconsideration it forces.

**Spike.** **S1 — architecture B and byte budgets.** Timebox 12 h. Question: *can one semantic view model drive both renderers accessibly, and what do the layers actually weigh?* Kill criteria, any of which stops M2 and reopens the decision: the element slice extrapolates past 24 kB with no route back inside it; the view model needs element names to serve the vanilla renderer; hydration warnings cannot be eliminated on either React major without client-only rendering.

**Effort.** ASSUMPTION: 12 h.

**Plan decisions, 2026-09-16.** Taken with the M1 plan; D3, D7 and D8 as recommended when the plan was approved without changes.

| # | Decision | Resolution |
|---|---|---|
| D1 | Is the spike's surface public API? | No. Exports are `@alpha` and unpublished; **no `docs/07-api.md`, API report or changeset in M1**. M2 creates the real surface with both, as M0's out-of-scope line already says. This supersedes, for M1 only, the repository instruction to create them "with the first public API" |
| D2 | Sessions without an R4 parser | A spike-only `createSession(DefinitionInput)`; renderers take a host-created `session`. M2 replaces the input with an R4 `Questionnaire` |
| D3 | User-facing text before the catalogue | Eleven `en` messages at the catalogue's path; no override or fallback (M4) |
| D4 | New dev dependencies | esbuild, `@playwright/test`, `@axe-core/playwright` at the root; React and React DOM 18.3.1 in their own private workspace package, `tools/react-18` |
| D5 | Where the browser proofs run | CI job `spike-proofs`, not a required check |
| D6 | Boolean control | A yes/no radio group. Native same-name radios supply the roving tab stop |
| D7 | Fixture pair for `enableWhen` | None in M1; with M2 AC-1 |
| D8 | Extrapolation method | Both marginal cost per concept and bytes per line; the wider band is published |

**Run on 2026-09-16; output `00-s1-architecture-and-bytes.md`, `08-dom-contract.md`.** Every acceptance criterion has its evidence: bytes measured per entry point and extrapolated two ways (AC-1); a budget verdict in `03-nfr.md` §2, keeping the figures and R1 open, approved 2026-09-17 (AC-2); the field-list deny-list test passing, signed off 2026-09-17 with a summary entry's `target` renamed `focusId` (AC-3); one contract suite identical across both renderers (AC-4); 0 axe violations in 24 runs (AC-5); SSR in Node and 0 hydration warnings on React 18 and 19 (AC-6); caret and focus kept on Chromium and WebKit (AC-7); strict CSP with adopted sheets on both engines (AC-8); and a go/no-go note in `05-architecture.md` §11, *continue*, approved 2026-09-17 (AC-9). No kill criterion triggered. Two findings carry into M5: ADR-0020's `display` field is allowed under ADR-0007's review rule as a named coincidence (decided 2026-09-17), and the view budget is the likeliest first overrun.

---

### M2 — Engine I: definition and evaluation

**Goal.** Build the thing that is the product: a definition compiler that rejects precisely, and an evaluation cycle that settles enablement, retention and repeat structure incrementally, deterministically, and in one notification. This is ADR-0009 implemented as written.

**Retires.** R6; first real reading on R7.

**Scope.**
- `kernel/`: `LinkId`, `ItemPath` (ordinal-based, interned), `ItemType`, `Diagnostic`, `Severity`.
- `fhir/r4/parse`: the only module that knows R4 shapes (ADR-0016), producing version-neutral `DefinitionInput`, rejecting non-R4 and recognisably-R5 input (INV-D-01).
- `definition/`: flat tables, dense ids, dependency edges labelled with scope, Tarjan SCC with cycle errors naming every `linkId`, topological ranks, depth ceilings, and the whole strict/lenient matrix of INV-D-01…D-15.
- `session/`: stored state (answers, repeat instances with ordinals and positions, lifecycle status, host identity); commands `SetAnswer`, `ClearAnswer`, `AddRepeatInstance`, `RemoveRepeatInstance`, `NoteItemLeft`, `RequestCompletion` (verdict wiring lands with M3); the cycle's guard/apply/settle/publish/notify steps; the single-writer queue; refusals as no-op cycles with a reason; the recompute trace behind a non-public test entry point.
- Retention SM-02 (`retain-exclude` and `discard`, including `discard` resetting a disabled repeating group) and repeat cardinality SM-05.
- Demo fixture v1 in `fixtures/` (AC-15.1.3 shape confirmed in M0), with the property test asserting its structural claims — the scored block's assertion arrives with M4.
- `docs/07-api.md` and the API Extractor report, created with this first public API.

**Out of scope.** Validation rules and surfacing, emission, snapshot, hydration (M3). Resolvers, scorers, evaluators, sanitizer, catalogue beyond the port *types* (M4). Anything in `view/` beyond what M1 left (M5).

**Acceptance criteria.**
1. Every supported `enableWhen` operator × answer-type pair has a named test and a conformance-matrix row; 0 gaps (NFR-Q-05, AC-02.1.3).
2. A cycle in the dependency graph is rejected at load with an error naming every `linkId` in it, and no evaluation is attempted (AC-02.5.1, INV-D-05); fixtures cover strict and lenient for INV-D-03, D-04, D-06, D-13, D-14, D-15.
3. Collapsing a three-deep chain produces the final state in one cycle and exactly one notification (AC-02.2.1, INV-S-33).
4. A property test over generated questionnaires and command sequences asserts that incremental settled state equals a from-scratch evaluation of the same stored state, and that shuffling declaration order changes nothing (INV-S-06).
5. The traced recompute set equals the transitive-dependent closure computed by an independent BFS, at the NFR-P-04 ceiling as confirmed in M0 (NFR-P-09, INV-S-07).
6. Conditions read only effectively enabled question nodes: a retained answer on a disabled node never satisfies one (INV-S-04, T4).
7. Per-instance behaviour: answering the trigger in instance 2 changes nothing in instances 1 and 3 (INV-S-08, AC-03.2.3); ordinals are never reused, positions stay dense (INV-S-20/21); `Add` is refused at `maxOccurs` and `Remove` is never refused on cardinality (INV-S-22/23).
8. Every refusal is a no-op cycle carrying a reason; no command path throws (`04-domain.md` §7.1, ADR-0002, ADR-0003).
9. Benchmarks for NFR-P-01, P-02 and P-08 run against committed baselines and fail on a > 20 % regression.
10. The whole suite runs in Node with no DOM shim; `@fhirq/core` coverage ≥ 95 % line / 90 % branch; mutation score ≥ 80 % on the enablement modules.
11. The bundle-budget gate is blocking for `@fhirq/core` at the figure M1 established.
12. `docs/07-api.md` and the API report exist and match; a changeset is present.

**Spike.** **S2 — mutation and pipeline cost.** Timebox 2 h, inside the milestone. Question: *what does StrykerJS incremental actually cost on this engine, and does the PR pipeline still fit 10 minutes?* Output: confirmation of A6, or the first invocation of ADR-0018's relief valve (WebKit to nightly). Run it as soon as the enablement modules are testable, not at the end.

**Effort.** ASSUMPTION: 30 h.

**Plan decisions, 2026-09-17.** Taken with the M2 plan, every one as recommended when the plan was approved. D1, D2 and D5 correct places where these documents disagreed with the R4 specification.

| # | Decision | Resolution |
|---|---|---|
| D1 | More than one `enableWhen` and no `enableBehavior` | R4 has no default here: the `enableBehavior` element and rule que-12 require a value (que-12's FHIRPath, `count() > 2`, is off by one; the element text governs). `strict` rejects; `lenient` applies `all` with a diagnostic. AC-02.3.3 and INV-S-02 amended; new INV-D-16 |
| D2 | Operators when the question has no answer, several answers, or is disabled | The R4 operator text. `=` holds when at least one enabled answer is equal; `>`, `<`, `>=`, `<=` when at least one enabled answer compares true (R4's "at least no answer" read as a typo). `!=` holds when no enabled answer is equal, **including when there is no answer**, so under INV-S-04 a disabled question enables a `!=` dependent. A named test and a matrix note record it |
| D3 | Comparison per type, and conditions that mean nothing | `exists` on every type. `boolean`: `=`, `!=`. `integer`, `decimal`: every operator, compared by numeric value with each other. `string`, `text`: `=`, `!=`, exact code points, no trimming or case folding. `date`, `dateTime`: every operator; values of different precision cannot be decided, so `false`; two `dateTime`s that both have a time and an offset compare as instants; a `date` is never shifted through UTC. `choice`, `open-choice`: `=`, `!=` on system and code, both matching including both absent, `display` ignored; free text never equals a `Coding`, and `answerString` compares against free text. `quantity`: compared only when system and code are identical, otherwise `false`; no UCUM conversion. Any other pairing of operator, `answer[x]` and question type is an INV-D-06 finding, and every such condition evaluates `false` at runtime in both modes |
| D4 | R4 constructs the domain model does not cover | (a) Items nested under a question: `strict` rejects; `lenient` turns the children into unsupported placeholders with a diagnostic (INV-D-17). (b) `initial[x]` and `answerOption.initialSelected`: ignored with a diagnostic in both modes (INV-D-18). (c) Option values `Coding`, `string`, `integer` and `date` are supported; `time` and `Reference` options are handled like unsupported item types (INV-D-19). (d) R4 rules que-1, que-4, que-6, que-7 and que-10 are INV-D-01 rejections in both modes; que-0 is a warning and ignored. Of the other rules, que-2 is INV-D-02, que-12 is INV-D-16, que-8, que-11 and que-13 concern `initial[x]` (b), and que-3, que-5 and que-9 are not enforced. (a), (b) and (c) each get a `not supported` matrix row |
| D5 | T3's premise | R4 is not silent: `enableWhen.question` resolves to the nearest occurrence along the ancestor axis, then preceding, then following. Inside a group, the nearest shared instance is that ancestor axis. From outside, R4's answer depends on document position; AC-02.5.4's rejection stays, T3 and `02-requirements.md` §17 are corrected, and the matrix reason reads "spec rule depends on document position; not supported" |
| D6 | Where the conformance matrix lives; what an M2 fixture holds | Rows in `docs/conformance/matrix.json` as `{id, feature, status, reason, tests[]}`, shape-tested from M2; M10 enforces the links and renders the page. This brings §5's "rows from M3" forward for M2's own rows. An M2 fixture is `questionnaire.json` plus `scenario.json` (commands, expected enabled paths, expected diagnostic codes and paths); `expected-response.json` joins in M3 |
| D7 | Benchmark fixtures and gate | A seeded, committed generator shaped by S0: 25 items, 500 items, and a ceiling labelled synthetic (1,000 items, 500 conditions, 50 instances × 20 items, depth 10). Baselines are committed JSON measured on the CI runner and change only through an explicit PR. The gate compares the median of ≥ 5 runs and fails above 20 % after one automatic re-run. P-08 heap is gated for regression; its 8 MB stays a target. **Revised 2026-09-17 (option (a), maintainer's decision):** five re-runs on unchanged `main` measured timings up to 2.2× apart across runner jobs and 25 % apart on one CPU model, but within about 1 % inside a job. Timings are therefore compared with the merge base benchmarked in the same job, runs alternating, failing above 20 % after one re-run; heap stays against the committed baseline; the committed timings are published reference figures |
| D8 | NFR-P-04's 50 repeat instances | Deliberate headroom, recorded in `03-nfr.md` and tested at 50. No check against real response data |
| D9 | M1's validation, view and renderers | `validateRequired` and the completion verdict stay wired until M3. `view/view.ts` changes only enough to compile against the new snapshot and keep rendering `boolean` and `string`. The browser test pages and the React SSR test switch to R4 JSON |
| D10 | New dev dependencies | `fast-check` (MIT), `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` (Apache-2.0), `@microsoft/api-extractor` (MIT). Benchmarks use Vitest's built-in `bench` |
| D11 | S2 kill criteria | K1: an incremental PR mutation run takes > 4 min on the runner ⇒ WebKit moves to nightly (ADR-0018's relief valve), re-measure, continue. K2: the projected blocking PR pipeline is still > 10 min p95 ⇒ stop; cut-ladder rung 1 (mutation narrowed to enablement) goes to product, no self-cut. K3: Stryker cannot run on this Vitest and TypeScript setup within the timebox ⇒ stop and ask; AC-10 stays open until an option is chosen |
| D12 | API report scope and the session entry point | Reports for `@fhirq/core` and `@fhirq/core/view`, view still `@alpha`; React, element and themes follow in M6–M8. `createSession(questionnaire, options?)` takes R4 JSON. The recompute trace is internal; tests import it by relative path |
| D13 | Invariants that depend on M4's ports | M2 records value-set references and expression bindings, and neither fails load (INV-D-08, INV-D-09). INV-D-09's "no evaluator" diagnostic is raised from M2. `unresolved-options`, refusing a coded `SetAnswer` while options are unresolved, and lenient `answerExpression` as "no options" land in M4. ADR-0003's refusal on calculated items lands in M2 |
| D14 | R4 TypeScript types | A hand-written minimal subset in `fhir/r4/types.ts`, headed as authored rather than generated; input is narrowed from `unknown` at runtime |
| D15 | ADR-0009's pruning against its own Verification line *(raised in step 6, decided 2026-09-17)* | Settling stops at a node whose own condition and effective enablement did not change, as the Decision says. The NFR-P-09 test asserts the trace is contained in the scoped closure, and equals an independent BFS that expands only through nodes whose own or effective state differs between from-scratch evaluations before and after. ADR-0009's Verification carries the dated amendment |

**Run on 2026-09-17, in PRs #14–#28 and the close-out.** Evidence per acceptance criterion:
- **AC-1.** 50 named operator × type tests in `session/conditions.test.ts`; generated fixtures `fixtures/enablewhen-*`; 50 rows in `docs/conformance/matrix.json`; 0 gaps, checked against the engine's comparison table.
- **AC-2.** The `cycle` fixture. Strict and lenient fixtures for INV-D-03, 04, 06, 13, 14 and 15, and for 02, 07, 16, 17, 18 and 19 as well.
- **AC-3.** `session/cycle.test.ts` and the `chain-collapse` fixture.
- **AC-4, AC-5 and AC-6.** `test/property/incremental.test.ts` (300 cases per property against `test/oracle.ts` and `test/bfs.ts`), `test/property/ceiling.test.ts`, and the `disabled-question-reads-unanswered` fixture.
- **AC-7.** `session/repeats.test.ts` and the `repeat-instances` fixture.
- **AC-8.** `session/refusals.test.ts`.
- **AC-10.** Core coverage 99.8 % line and 98.8 % branch, and mutation 90.1 % on the runner, both required checks with a nightly full run.
- **AC-11.** `@fhirq/core` at 10.16 kB of 14 kB, required.
- **AC-12.** `docs/07-api.md`, `packages/core/etc/*.api.md` checked in CI, and the first changeset.

Spike S2 ran after step 6 (`00-s2-mutation-cost.md`).

- **AC-9.** `scripts/bench-compare.mjs` in the `Benchmarks` job: timings against the merge base in the same job, heap against `benchmarks/baseline.json`, the 25-item absolute budgets, with a fixture that must fail. D7 was revised for it after a committed timing baseline failed on runner noise.

**Still open.** The core bytes read against `03-nfr.md` §2's tripwire; see the reading there.

**Found on the way.** Modifier extensions are rejected in both modes, because R4 forbids ignoring them (INV-D-01). The public `Questionnaire` type leaves nested R4 elements `unknown`, to keep fifteen R4 shapes out of NFR-U-05's count, which stands at 50 of 60 (`07-api.md` §2). Type-aware linting is on.

---

### M3 — Engine II: validation, projection, interchange

**Goal.** Establish the single visible projection that BC3, BC4 and every collaborator read, and the two deliberately separate outputs built on it — the emitted `QuestionnaireResponse` and the full-fidelity snapshot — plus the two entry paths back in, hydrate and restore.

**Scope.**
- `session/projection`: the one read path, with the module import table of `05-architecture.md` §4.1 enforced by lint so that `interchange/` has no way to reach a disabled node.
- `validation/`: built-in rules (required, `maxLength`, min/max value, `maxDecimalPlaces`, date syntax versus range, quantity unit present, min/max occurs); cross-field rule registration with declared inputs; surfacing SM-03 including `blur-then-live` and D4's "never reverts"; the ordered, serializable validation result; the completion verdict feeding SM-01.
- `interchange/`: `encodeResponse`, snapshot and restore, `decodeResponse` and the hydration policy of `04-domain.md` §8 in full — drift, orphans, quarantine, repeat reconstruction, dropping answers that land on disabled nodes, always entering `in-progress`.
- The `@fhirq/core/resume` entry point (ADR-0021): `snapshot`, `restoreSession` and `hydrateSession` as top-level functions; emission stays in `@fhirq/core`. The session's state registry, the lint rows and the bundle-inputs check from ADR-0021's Verification; its budget, API report and deep-import allowance.
- Conformance fixture pairs for each of these spec behaviours, with matrix rows.

**Out of scope.** Host collaborators other than cross-field rules, which are needed to finish surfacing (M4). Anything presentational (M5). Message text beyond keys — the catalogue lands in M4, so issues carry codes and keys here.

**Acceptance criteria.**
1. `emit(hydrate(emit(s))) = emit(s)` ignoring `authored` and `status`, over ≥ 1,000 generated cases per run with 0 failures (INV-E-06, NFR-Q-06).
2. `restore(snapshot(s))` is indistinguishable from `s`, including retained answers, ordinals, positions and surfacing (INV-E-07, AC-05.3.1).
3. A disabled node's answer never appears in an emitted response, in any shape, including as a null answer (INV-E-01/E-02, AC-05.2.2) — proven both by test and by the lint rule that denies `interchange/` any path to session internals.
4. A snapshot restored against a different questionnaire canonical or version is refused with a typed error naming both (AC-05.3.3, A5).
5. Hydration diagnostics name path and expected/found types and never a value, for orphans, quarantined answers, drift and `hydrated-answer-disabled` (INV-E-08/E-09, T6, T7, NFR-X-04).
6. A disabled required item is never invalid; a cross-field rule touching a disabled node is skipped (INV-V-01, INV-V-03).
7. Issues are ordered by document order then repeat position; form-level issues have no path (INV-V-06).
8. Surfacing never reverts from live to quiet, including across hide and show (D4, AC-04.2.4).
9. Completion is refused with the validation result and no status change when any error-severity issue exists; `completed` refuses all subsequent answer and repeat commands (INV-S-30/31).
10. Core coverage and mutation gates hold with validation and emission modules included (NFR-Q-01, NFR-Q-03).
11. No input from `session/snapshot`, `interchange/decode`, `interchange/hydrate` or `src/resume.ts` reaches the `@fhirq/core`, view or element bundles, with a must-fail fixture; `@fhirq/core/resume` is inside its 4 kB budget with the gate blocking, or its figure is amended by ADR from that reading (ADR-0021, A7); `@fhirq/core` stays inside 14 kB.

**Spike.** None. Every behaviour here is pinned by an invariant or an acceptance criterion; the work is volume, not discovery.

**Effort.** ASSUMPTION: 24 h.

**Plan decisions, 2026-09-18.** Taken with the M3 plan, every one as recommended. D1 and D2 settle where AC-04.2.1 and AC-04.2.2 meet NFR-X-04 and INV-S-10; both criteria finish in M5.

| # | Decision | Resolution |
|---|---|---|
| D1 | Can an issue carry the entered value (AC-04.2.1)? | No. An issue carries its code, a message key and the authored limit (`params`); the view adds the entered value when it renders (M5). Issues stay safe to log (NFR-X-04), and `04-domain.md` §7.2 stands |
| D2 | Where "not a date" comes from (AC-04.2.2, INV-V-07) | The engine holds typed answers only (INV-S-10), so an emitted response is always valid R4. It reports a date outside its range; "not a date" is the view model's issue on a draft, from M5. INV-V-07 amended, new INV-P-06 |
| D3 | The symbol budget (NFR-U-05) | M3 adds at most 5 symbols. Rules are an inline `SessionOptions` field, the resume functions reuse `SessionOptions`, and a snapshot is typed as JSON. The allocation is in `07-api.md` §2 |
| D4 | Surfacing modes | `blur-then-live` only; the snapshot records the mode, so a second one needs no format change |
| D5 | Cross-field rules | `SessionOptions.rules`, fixed per session (ADR-0001). Items named by `linkId`, run per shared repeat instance with `enableWhen`'s scoping (INV-D-13); a rule returns a message key. Rules are not in the snapshot, so restore needs the same ones |
| D6 | Questionnaires without a `url`; a different `url` on hydrate | Emit without `questionnaire`; restore treats both absent as a match. A different `url` on hydrate is `version-drift` naming both, and hydration continues. `04-domain.md` §8 step 2 amended |
| D7 | Mutation scope | `validation/` and `interchange/emit` join the mutated set, with `kernel/compare` (the comparison moved out of `session/conditions`). Decode, hydrate and snapshot do not |
| D8 | Small choices, settled with their tests | A date of another precision than its limit raises no issue. Hydration diagnostics gain optional `expected` and `found`. Restore errors are `snapshot-mismatch` and `snapshot-format` |

**Run on 2026-09-18, in PRs #33–#41.** Evidence per acceptance criterion:
- **AC-1.** `test/property/roundtrip.test.ts`: 1,000 generated sessions per run through the public API and R4 JSON text, over every answer kind, repeating questions, nested repeats, retained answers, both retention policies, host identity and completed sessions. It asserts no hydration diagnostic and an identical re-emission. Vacuity guard: each feature appears in at least 2 % of cases; retained answers, the thinnest, run at about 5 %. Fixture `hydration: round trip`.
- **AC-2.** `test/property/restore.test.ts` (300 cases: state, snapshot and response equal, then equal again after the same further commands) and `test/resume/snapshot.test.ts`.
- **AC-3.** `test/interchange/emit.test.ts`, the `emission` fixture, the sentinel test `test/property/leak.test.ts`; and the lint row `interchange/emit` → `session/projection` only, with its must-fail fixture.
- **AC-4.** `test/resume/snapshot.test.ts`: `snapshot-mismatch` with a `version-drift` finding naming both canonicals.
- **AC-5.** `test/resume/hydrate.test.ts` and the `hydration` fixture: paths, `expected` and `found`, never a value.
- **AC-6.** `test/validation/built-in.test.ts` and `rules.test.ts`; the `validation` fixture.
- **AC-7.** The same tests: document order, then position; form-level issues first, with `path: null`.
- **AC-8.** `rules.test.ts` › surfacing, and M2's `session.test.ts` SM-03 cases.
- **AC-9.** `session.test.ts` and `rules.test.ts`: a refused completion changes no status; `completed` refuses every answer and repeat command, restored too.
- **AC-10.** Core coverage 99.91 % line, 98.53 % branch. Mutation on the new modules 91.3 % locally (validate 100, built-in 95.9, emit 95.2, rules 92.7, compare 84.1), and on the changed session modules 99.2 %; the incremental lane passed the 80 % break on every PR, and `stryker.config.json` mutates them from now on.
- **AC-11.** `@fhirq/core/resume` 3.34 kB of 4 kB, gated; `@fhirq/core` 12.81 kB of 14 kB; the bundle-inputs check blocks on core, view, element and IIFE, with a must-fail fixture (`scripts/test/fixtures/bundle-inputs/leaky-core.ts`). Lint rows with must-fail fixtures; `no-deep-imports` allows `@fhirq/core/resume`; `core-resume.api.md` in `api:check`, 3 symbols counted.

**Still open.**
- **K1 tripped, and was relieved inside the lane.** The incremental mutation lane took 423, 291, 280, 498 and 396 s on the five PRs that added or changed mutated modules (PRs #36–#40), and 282 s on #41, against spike S2's K1 of 4 min. The blocking pipeline stayed inside NFR-M-07's 10 min (8.3 min at worst), so K2 has not tripped. M2 plan D11 names WebKit to nightly as K1's response, but that does not apply: WebKit runs only in the non-blocking lane, in parallel with mutation, so moving it shortens nothing that K1 measures, and ADR-0018 moves it only when NFR-M-07 is breached (`00-s2-mutation-cost.md` §7). The relief taken is S2's first: the round-trip, restore and leak properties leave `stryker.vitest.config.ts` and stay in `pnpm test`. Full local runs with and without them both score 95.29 % over 1,465 mutants, in 8 min 8 s and 7 min 11 s; the three mutants only they detected were two in `validation/rules.ts`, now killed by a unit test, and one in `validation/validate.ts` that is equivalent. Two things inflated the readings besides test time: PRs #36–#40 each ran a new module's mutants for the first time, and #41 diffed against an older `main` result because `main`'s run for the previous merge had not yet saved its own (348 mutants rerun on a PR that changed no core file). The next reliefs, if K1 trips again: split the lane into a matrix of jobs by module; `ignoreStatic` only as your call.
- **Core's headroom is 1.19 kB for M4** (`03-nfr.md` §2).

**Found on the way.**
- INV-D-20, for a constraint on an item type it cannot apply to.
- A required group is held to an answered descendant.
- `open.ts`, an internal root file that `index` and `resume` share.
- A throwing rule is reported once per rule per session, not once per cycle, so diagnostics cannot grow without bound. M4 settles the full collaborator contract.
- `measure-bundles` wrote the imports of excluded core modules as absolute paths, so the resume figure depended on where the repository was checked out: 3.38 kB in one checkout and 3.46 kB in another. They are repository-relative now, and a test holds that; the 3.34 kB reading is path-independent.

---

### M4 — Ports and the safety boundary

**Goal.** Let the host plug in what it owns, keep the library safe when the host misbehaves, and turn the no-network/no-storage/no-telemetry claim from a promise into a test.

**Scope.**
- `ports/` (types only, per §4.1) and their wiring: option resolver with eager per-session resolution, `AbortSignal` on dispose, verbatim error exposure, retry only from `Failed`, settlement as its own cycle (SM-04, ADR-0005, ADR-0012, T12); scoring functions; the `ExpressionEvaluator` seam with a test-only stub proving it is not decorative; sanitizer; message catalogue with per-key fallback.
- Uniform collaborator failure handling: a throw becomes a diagnostic without the thrown message text, clears the derived value rather than leaving it stale, and does not abort the cycle (INV-X-09, ADR-0006).
- The NFR-X-04 lint rule banning answer values in diagnostics, and the AC-14.6.1 throwing-stub test over `@fhirq/core`.
- Demo fixture's scored block assertion completed (AC-15.1.1).

**Out of scope.** The default HTTP resolver — it lives in `@fhirq/element` and lands in M7 (ADR-0012). Playground's in-memory resolver (M9). The PHQ-9/GAD-7 worked example as documentation (M10); only its test fixture lands here.

**Acceptance criteria.**
1. The resolver is called at most once per distinct canonical per session, at session start, and again only on explicit retry (INV-X-01); a pending resolution blocks no command on any other node (INV-X-02).
2. A coded answer is refused while its option set is unresolved, while free text on `open-choice` is still accepted (SM-04, AC-07.1.1).
3. Hydrated coded answers are loaded and not invalidated when options are pending, failed or absent (T8, AC-07.1.4).
4. Scorers, cross-field rules and the evaluator each receive the visible projection read-only, and cannot mutate session state (INV-V-04, INV-X-04).
5. A throwing scorer, rule or evaluator produces a diagnostic with no message text, clears its value, and leaves the form interactive (AC-04.3.2, AC-07.2.4, AC-07.3.4).
6. A command issued from inside a rule, scorer or evaluator is refused (ADR-0009, single writer).
7. A missing catalogue key falls back to the built-in default and never yields an empty or raw-key string (INV-X-08).
8. With `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB` and `document.cookie` replaced by throwing stubs, a full `@fhirq/core` lifecycle invokes none of them (AC-14.6.1, NFR-X-01/02).
9. The NFR-X-04 lint rule fails a fixture that interpolates an answer value into a diagnostic.

**Spike.** None.

**Effort.** ASSUMPTION: 10 h.

**Plan decisions, 2026-09-19.** Taken with the M4 plan, D1–D10 as recommended, plus a ruling made during the build.

| # | Decision | Resolution |
|---|---|---|
| D1 | Public symbols (5 left) | Three named exports: `OptionResolver`, `ExpressionEvaluator`, `VisibleProjection`. Scorers, the sanitizer and the error handler are inline shapes on `SessionOptions`. 58 of 60 used |
| D2 | Byte headroom | Build in order, measure after each step, stop at 13.8 kB |
| D3 | The sanitizer | `SessionOptions.sanitize(xhtml) → string`, run once as the session opens over `rendering-xhtml`; its output is `ItemDefinition.xhtml`. None, a throw or a non-string: `null` and `no-sanitizer` or `sanitizer-threw`, and the plain text renders |
| D4 | What collaborators read | Scorers and the evaluator get the deeply frozen `VisibleProjection`; rules keep M3's shape (frozen answers by `inputs`, per repeat instance). ADR-0009 amendment note. AC-04.3.2 and AC-07.2.1's "state snapshot" read as the visible projection, since a snapshot holds retained answers (INV-X-04) |
| D5 | Scorers | `SessionOptions.scorers: Record<name, { inputs, score(projection) }>`, results opaque on `SessionState.scores[name]`, `null` once cleared. Not emitted, not in the snapshot: recomputed. Re-run only when their inputs' visible nodes or answers change |
| D6 | Retry and dispose | The `RetryOptions` command, refused as `options-not-failed` unless the set failed; ADR-0012 wording amended. `Session.dispose()` aborts the signal, drops late settlements and refuses later commands as `disposed`. A canonical is keyed verbatim: `url|1` and `url|2` resolve separately |
| D7 | Collaborator codes and cadence | `unresolved-options` (path, detail = canonical), `resolver-failed` (detail = canonical, once per failure), `scorer-threw` (detail = name), `evaluator-threw` (path; detail `type` for a wrong kind), `no-sanitizer`, `sanitizer-threw`. Once per collaborator (per path for the evaluator) per session, except `resolver-failed`. The host's error goes verbatim to `SessionOptions.onCollaboratorError(error, diagnostic)`, never into state; a throwing handler is `listener-threw` |
| D8 | The evaluator's reach | `calculatedExpression` only (ADR-0017), in document order at cycle step 4, on any cycle that changed answers or enablement. Values join the projection and the response, not the snapshot; a hydrated answer on a calculated item is replaced when an evaluator is given. `no-evaluator` only without one. Input-declared scheduling (US-07.3's `Should`) waits |
| D9 | NFR-X-04 lint rule | Type-aware: `fhirq/no-answer-in-diagnostics` reports an answer, or anything holding one, reaching `diagnostic(…)`, `new FhirqError(…)` or `console.*` |
| D10 | PHQ-9/GAD-7 and the demo | The fixture is HL7's published copy, fetched by the maintainer, who also confirms the free-use terms. The demo gets an original PHQ-2-shaped block with `ordinalValue`, scored by a test-only scorer; the demo test also gains M3's cross-field rule assertion (AC-15.1.1) |
| — | `AbortController` in core | Allowed in `session/options.ts` only, by the `no-dom-in-core` allowlist; `AbortSignal` is declared structurally in `ports/`. ADR-0012 stands |

---

### M5 — Presentation model

**Goal.** Write every BC6 behaviour that is not markup, once, in a DOM-free module tested in Node under the core gates. This is where R2 is settled for real, having been proven in miniature by M1.

**Retires.** R2 (view-model sufficiency) in full.

**Scope.** Control choice including the `itemControl` hints and the option-count fallback (INV-P-05); path-derived ids; ARIA state per node; announcement text and its per-cycle coalescing, with resolver-driven cycles announced in their own right (INV-P-03, T12); the error summary and its ordering; focus targets after a new instance, a removal, a refused completion; the inert add control with its reason (INV-P-04); the unsupported-item placeholder (AC-01.3.2); per-node view identity so that only changed nodes get new objects; the exported `ControlProps` tier-3 contract of ADR-0013; `Intl` formatting of dates, numbers and quantities from the explicit `locale` and `timeZone` presentation options, at authored date precision and with no timezone round-trip, each node carrying both its domain value and its `display` string (NFR-I-04, ADR-0020); the DOM contract document finalised.

**Out of scope.** Markup of any kind. React and element bindings (M6, M7). Theme tokens beyond the class and `part` names the contract fixes (M8).

**Acceptance criteria.**
1. A Node-only test drives the demo fixture through a refused completion and asserts the error summary's order, the focus target and the announcement text, with no renderer involved (ADR-0007 verification).
2. At most one announcement per evaluation cycle, naming what changed and how many items (INV-P-03, NFR-A-08).
3. Switching tier or theme leaves answers, enablement and surfacing untouched (INV-P-01) — asserted on the view model, before any renderer can be blamed.
4. Unchanged nodes keep object identity across a cycle; changed nodes do not, asserted by reference equality over a scripted command sequence.
5. Every view node exposes the four ids and a surfaced issue is programmatically associated with its control (INV-P-02).
6. ADR-0007's review rule holds across the finished field list: no field names an element, an attribute literal or a CSS property.
7. `@fhirq/core/view` is inside its budget (M1's figure), and its entry point is covered by the blocking budget gate.
8. Core coverage and mutation gates hold with `view/` included (NFR-Q-01, NFR-Q-03).
9. Every row of the `05-architecture.md` §4.1 import table is enforced by lint — the table is complete once `view/` lands — with a fixture per row that must fail (NFR-M-06). M3 AC-3 already covers the `interchange/` row.
10. `docs/07-api.md`, the API report and a changeset reflect the new exports; the total public surface is re-counted against NFR-U-05's 60.
11. ADR-0021's rung-2 reading is recorded in `03-nfr.md` §2: the element projected from the measured core, view and theme gates plus S1's renderer range. If its centre is over 24 kB, M7 builds table-driven patchers.

**Spike.** None — S1 already answered the open question; what remains is volume under a review rule.

**Effort.** ASSUMPTION: 16 h.

---

### M6 — React adapter

**Goal.** A React package thin enough to stay inside 6 kB and complete enough that the default UI is itself the proof that the headless tier is sufficient.

**Retires.** R5 (React SSR with zero hydration warnings on 18 and 19) in full.

**Scope.** `useQuestionnaire`, the re-exported `createSession`, `<Questionnaire>`; reading through `useSyncExternalStore` with the same snapshot on server and client; `React.memo` per item path; the three-step controlled-by-response protocol of ADR-0015 (reference echo, semantic echo, external replacement with its diagnostic); tier 3 `controls` mapping with the development-only ARIA check; tier 4 exposure; the `locale` and `timeZone` options passed through to `view/`, defaulting to a fixed `"en"` and never sniffed, so server and first client render agree (ADR-0020); the lint rule confining DOM access to effects and handlers.

**Out of scope.** Any default HTTP resolver (ADR-0012 gives React none by design). Themes beyond importing them (M8). Playground (M9).

**Acceptance criteria.**
1. The quickstart renders a complete accessible form in ≤ 10 lines of consumer code, and that sample is compiled and executed in CI (NFR-U-01, NFR-Q-08).
2. The default UI imports only the public hook and view types; a test fails if it imports anything the headless tier cannot reach (AC-08.2.1).
3. Server render in a Node process with no DOM globals produces markup reflecting initial enablement; hydration produces 0 console warnings, on React 18 and React 19, with the test failing the build on any warning (AC-08.3.1/2, NFR-C-08, NFR-C-03).
4. A response echoed back — same reference, and separately a structured clone — leaves the session untouched: retained answers and surfacing survive and no diagnostic is raised (AC-08.1.3).
5. A genuinely different response resumes a new session and raises `controlled-value-replaced` (AC-08.1.4).
6. Session-controlled mode preserves everything across a host-driven re-render (AC-08.1.2).
7. A tier-3 override that omits `id` triggers the development diagnostic naming the item type and the missing attribute; one that applies the ids passes the label, error and `aria-invalid` association tests (ADR-0013).
8. `@fhirq/react` holds its budget excluding React, core and view (NFR-S-02, A2), with the gate blocking.
9. Adapter coverage ≥ 85 % line / 80 % branch (NFR-Q-02).
10. Keystroke-to-paint is measured on the demo fixture and recorded against NFR-P-03.

**Spike.** None; S1 proved the SSR path on a slice, and the residual risk here is breadth.

**Effort.** ASSUMPTION: 16 h.

---

### M7 — Element and script-tag embed

**Goal.** The secondary user's entire path: one script tag, one custom element, no build step — inside the tightest budget in the project.

**Retires.** R4 (keyed patching that never disturbs focus or caret) in full; holds R1 at the element's 24 kB budget, against the figures M1 measured.

**Scope.** `<fhir-questionnaire>` with an open shadow root; the keyed patcher; stylesheets embedded at build time and adopted once per document; `--fhirq-*` inheritance and `::part` hooks; `questionnaire` property and `src` attribute; the `locale` property and its `lang`-then-`navigator.language`-then-`"en"` fallback, the element's half of ADR-0012's asymmetry (ADR-0020); change and complete events carrying plain objects; the default resolver in `default-resolver.ts` — the only file in the repository permitted a network call; connect/disconnect hygiene through one `AbortController` per connection; tier-3 overrides as host-defined custom elements inside the shadow root, driven by `fhirq-set`/`fhirq-clear`/`fhirq-leave`; ESM and IIFE outputs.

**Out of scope.** Form participation with a surrounding `<form>` — AT5 puts it out of v1; M0 confirms that and records the follow-up. Theme presets beyond the embedded default (M8).

**Acceptance criteria.**
1. A plain HTML page with one script tag and one element renders a working form with no bundler, transpiler or framework (AC-09.1.1).
2. `@fhirq/element` standalone and the IIFE both hold the budgets M1 established, with the gate blocking (NFR-S-02, NFR-S-03). If they do not with M5's rung 2 in place, the ADR amending the element and IIFE figures to the measured numbers lands in this milestone (ADR-0021, rung 3); the theme stays embedded.
3. Under `script-src 'self'; style-src 'self'` the element renders with 0 `<style>` elements, 0 `style` attributes and 0 `el.style` writes (NFR-C-07, ADR-0014), verified in Chromium, Firefox and WebKit.
4. A host page with hostile global CSS leaves layout and controls intact, and no library style reaches the host page (AC-09.2.1).
5. Typing continuously into a text item across multiple cycles never loses focus or caret position, and a focused control is never replaced (ADR-0007, NFR-A-07, NFR-P-03).
6. Removing and re-inserting the element re-renders from current state with no duplicated listeners and no detached-node leak, asserted by a listener-count test (AC-09.3.1).
7. Tokens cross the shadow boundary and every documented `part` name is present and stable (AC-09.2.2).
8. With `value-set-base` set and no injected resolver, exactly one `GET` per canonical is made, and the throwing-stub test shows network access confined to that one code path (AC-07.1.3, AC-14.6.1).
9. Two elements on one page do not collide on ids (ADR-0014).
10. Element coverage ≥ 85 % / 80 % (NFR-Q-02).

**Spike.** None as a separate activity — S1 carried the patcher and `adoptedStyleSheets` risk deliberately early. If S1's byte verdict forced an ADR amendment, this milestone implements it.

**Effort.** ASSUMPTION: 20 h.

---

### M8 — Themes and accessibility completion

**Goal.** Turn the accessibility claim into published evidence at full breadth, and finish the token system both renderers already consume.

**Retires.** R8 (accessibility at full breadth) in full.

**Scope.** `base.css` completed against the DOM contract; light and dark presets; logical properties throughout; `forced-colors` and `prefers-reduced-motion` handling; the print stylesheet (`Should`, `02-requirements.md` §17); the automated accessibility matrix; contrast, focus-indicator, target-size, reflow and RTL gates; the manual screen-reader passes and the dated public record with its honest gap list.

**Out of scope.** New behaviour of any kind. If an accessibility finding needs behaviour, it is a bug fix in M5's module and starts with a failing test.

**Acceptance criteria.**
1. 0 automated violations at WCAG 2.2 A and AA across demo forms × 4 tiers × light and dark × 375 px and 1280 px, in **both** renderers, with the report published as a build artifact (NFR-A-01, AC-11.5.1).
2. Rendering with every token set to a sentinel value leaves no default preset value in computed styles, in both renderers (AC-10.2.1).
3. A stylelint rule proves `base.css` holds no literal colour or length beyond `0` and token-derived relative units, and no physical-direction property (NFR-I-05).
4. Contrast ≥ 4.5:1 body and ≥ 3:1 large text and non-text UI in both presets; focus indicator ≥ 2 px and ≥ 3:1, visible in `forced-colors`; interactive targets ≥ 24 px with primary controls ≥ 44 px (NFR-A-03/04/05).
5. No horizontal scrolling at 320 px or at 400 % zoom on 1280 px (NFR-A-06).
6. A `dir="rtl"` snapshot test passes for both renderers (NFR-I-05).
7. The dated manual record covers the confirmed screen-reader pairs, names the criteria checked, and lists known gaps completely (NFR-A-02, NFR-A-09, AC-11.5.2).
8. Theme budgets hold: `base.css` and each preset (NFR-S-02), gate blocking.
9. Tier 2 reaches a host design system in ≤ 30 lines of CSS and no JavaScript, demonstrated by a worked example that is compiled in CI (NFR-U-02).

**Spike.** None. The residue here is findings, not unknowns about approach.

**Effort.** ASSUMPTION: 16 h — plus manual screen-reader time, which recurs every release (N11) and is not in the build budget.

---

### M9 — Playground

**Goal.** The artifact STK judges the project by in 30 seconds, and the one EVL uses to check the retention policy without installing anything.

**Scope.** A Vite React SPA built from the packages' `dist`; the demo fixture rendered above the fold with one sentence of positioning; the response-versus-state pane; the paste-your-own editor with full diagnostics linking conformance rows; the tier switcher over one session; the in-memory resolver over bundled value sets; the strict CSP delivered by `<meta>`; fragment-only share links (`Could`, using `CompressionStream`); deployment to Pages under `/playground/`.

**Out of scope.** Any server, any analytics, any third-party script, font or image (NFR-X-09, ADR-0019). A syntax-highlighting editor beyond a lazy-loaded `Could`. A reference backend — dropped in M0.

**Acceptance criteria.**
1. On a 375 px viewport, an interactive form and one explanatory sentence are visible above the fold with no empty state, no configuration step and no modal (AC-12.1.1, NFR-U-04).
2. Answering the first question makes conditional questions appear, with no scrolling (AC-12.1.2, AC-15.1.4).
3. The response pane and the engine-state pane can be compared side by side, making exclusion-on-hide visible (AC-12.2.1).
4. Pasted JSON re-renders live; invalid or unsupported input shows the load diagnostics in full with links to conformance rows (AC-12.3.1).
5. The served page carries `connect-src 'none'`, a visible statement that nothing leaves the browser, and a test asserting no network request after initial assets (AC-12.3.2).
6. The tier switcher re-renders the same session with answers preserved (AC-12.4.1, INV-P-01).
7. Lighthouse on a throttled mid-tier mobile profile: performance ≥ 90, LCP ≤ 2.5 s, TBT ≤ 200 ms, CLS ≤ 0.1, blocking in CI (NFR-P-06).
8. The playground imports only published entry points from `dist` — a deep import or a source import fails lint (ADR-0019, NFR-M-06).

**Spike.** **S3 — first-paint budget.** Timebox 2 h, inside the milestone, run before the editor and panes are built. Question: *does a React SPA carrying core, view, react and a theme hit Lighthouse ≥ 90 on the throttled profile?* Output: confirmation, or the deferral plan (editor and panes behind idle/interaction, which ADR-0019 already anticipates) applied from the start rather than retrofitted.

**Effort.** ASSUMPTION: 12 h.

---

### M10 — Docs, conformance matrix, adoption pack

**Goal.** EVL's 15–40 minutes, and the pack that lets an adopting team start a dependency review without contacting anyone.

**Scope.** README above the fold; the docs site generated at build time with samples imported from compiled, tested sources; ADRs rendered from the repository; the conformance matrix with every row's status, reason and test link; the regulated-adoption pack; the PHQ-9/GAD-7 scoring worked example; the not-a-medical-device statement; the NFR-M-09 non-commitment and the NFR-X-08 security-report windows it refers to.

**Out of scope.** New library behaviour. A row's status may not be improved by writing documentation — only by a test (AC-13.4.2).

**Acceptance criteria.**
1. Every conformance row carries `supported` / `partial` / `not supported` / `out of scope`, a one-line reason for each exclusion, and a link to a passing test for each supported row; CI fails if any supported row lacks one (AC-13.4.1/2, NFR-Q-04).
2. Every excluded feature from Brief §5 and `02-requirements.md` §17 appears as a row, including R5, FHIRPath, terminology resolution, `amended`, cross-repeat conditions, conditions on calculated items, the non-`calculatedExpression` extensions, and translation extensions (NFR-I-06).
3. 100 % of public API examples in the docs are compiled and executed in CI (NFR-Q-08).
4. The README's first screen carries the positioning line, a demo of the rules engine, the zero-dependency / no-PHI / no-platform claims each linked to its evidence, the install command and a ≤ 10-line example (AC-13.1.1).
5. A clean-machine walkthrough of the quickstart reaches a rendered form within NFR-U-01's time, recorded with the date and machine.
6. The adoption pack contains the dependency inventory with licences, the SBOM, the no-PHI/no-network statement next to the test that enforces it, the accessibility record, the browser matrix, and the semver and deprecation policy (AC-13.5.1).
7. Each ADR states context, options, decision and consequences including costs accepted, and every claim is arguable from first principles with no appeal to unverifiable behaviour of other systems (AC-13.3.1/2, NFR-Z-03).
8. Published numbers in the README match the gates in CI, checked by a script rather than by eye (NFR-S-02/03, NFR-P-04/05).
9. The README states the NFR-M-09 non-commitment together with the NFR-X-08 acknowledge and patch windows, and a reporting address, so the security response is the only published commitment and is published with its numbers.

**Spike.** None.

**Effort.** ASSUMPTION: 14 h.

---

### M11 — Release engineering and 1.0.0

**Goal.** Every gate blocking, every artifact reproducible and verifiable, and the four packages published in lockstep.

**Retires.** R7 (the CI pipeline's own budget) in full, on the complete pipeline; M2 took the first reading.

**Scope.** Consumer smoke tests across the six NFR-C-02 environments against packed tarballs; the remaining in-repo gates (dependency, packed contents, licence, API report diff) with their negative fixtures; provenance, CycloneDX SBOM, signed tag; Changesets fixed-mode release at 1.0.0; nightly full mutation and high-count property runs wired as release blockers; Pages deployment of docs and playground.

**Out of scope.** Post-1.0 maintenance policy beyond what NFR-M-09 already states. Any feature.

**Acceptance criteria.**
1. All six consumer environments import, type-check and execute against packed tarballs, including Node ESM, Node CJS, Vite, webpack 5, Next.js App Router and a plain script tag, with React 18 and 19 where relevant (AC-14.3.1, NFR-C-02/03).
2. 0 direct and 0 transitive runtime dependencies in every published package, enforced by a gate that names the offender, with a negative fixture proving the gate fails (AC-14.1.1, NFR-S-01).
3. Packed contents are dist, types, README, LICENSE and NOTICE only (NFR-S-08), with a negative fixture.
4. The licence gate accepts MPL-2.0 in `devDependencies` only and fails naming any other non-allowlisted licence (NFR-S-07, AT1), with a negative fixture.
5. No `any` in the public surface; the API report diff is blocking; the public symbol count is within NFR-U-05 and published.
6. Release carries npm provenance, a CycloneDX SBOM, a signed tag and a changelog linking merged PRs (AC-14.5.1, NFR-X-07).
7. The nightly full mutation run and the high-count property run are green on the release commit; a red nightly blocks release (A6, ADR-0018).
8. The blocking PR pipeline's p95 wall-clock is measured and reported against NFR-M-07, with ADR-0018's relief valve applied if breached.
9. 0 high or critical known vulnerabilities at release (NFR-X-06).

**Spike.** None.

**Effort.** ASSUMPTION: 8 h.

---

## 4. Dependency order

```
M0 ─► M1 ─► M2 ─► M3 ─► M4 ─► M5 ─┬─► M6 ─┐
                                  └─► M7 ─┴─► M8 ─┬─► M9 ──┐
                                                  └─► M10 ─┴─► M11
```

M6 and M7 are independent of each other once M5 lands and are the natural place to parallelise if a second pair of hands ever appears. M10 depends on M8 for the accessibility record and on M9 only for links, so it can start alongside M9.

---

## 5. Gate ladder

A gate becomes blocking in the milestone that first produces its subject.

| Gate | Blocking from | Source |
|---|---|---|
| Branch protection on the default branch: 0 direct pushes, PR required, PR links a story or ADR | M0 (from the end of the milestone) | NFR-M-08 |
| Typecheck, lint, core unit tests (fast lane) | M0 | NFR-M-07 |
| Architectural lint rules: no DOM in core, no network anywhere, no hard-coded strings, no deep imports | M0 (rules), tightened M2/M4/M5 as modules land | NFR-M-06 |
| Cyclomatic complexity ≤ 15 per function, named exceptions carrying an inline justification | M0 (rule), real bite from M2 | NFR-M-02 |
| Core coverage ≥ 95 / 90 | M2 | NFR-Q-01 |
| Mutation ≥ 80 on engine modules, incremental on PRs | M2 | NFR-Q-03, A6 |
| Bundle budgets per entry point | M2 core · M3 `core/resume` and the resume bundle-inputs check (ADR-0021) · M5 view · M6 react · M7 element and IIFE · M8 themes | NFR-S-02/03 |
| Benchmarks: timings against the merge base in the same job, heap against the committed baseline, > 20 % regression fails | M2 (D7 as revised) | `03-nfr.md` §1 |
| Recompute-set assertion | M2 | NFR-P-09 |
| Round-trip property tests, ≥ 1,000 cases | M3 | NFR-Q-06 |
| Conformance: every `supported` row links a passing test | M2 (rows appear, shape-tested; M2 D6), enforced M10 | NFR-Q-04, AC-13.4.2 |
| Throwing-stub no-network/no-storage test | M4 core · M6 react and themes · M7 element's single path | AC-14.6.1, NFR-X-01/02 |
| `Intl`-only formatting: 0 hand-rolled date, number or unit formatting | M4 catalogue · M5 `view/` formats · M6/M7 supply the locale | NFR-I-04, ADR-0020 |
| SSR hydration, 0 warnings, React 18 and 19 | M6 | NFR-C-08 |
| CSP render, no inline styles, 0 `eval`/`new Function` | M7 (M1 proves it) | NFR-C-07 |
| Automated accessibility across tiers, themes, viewports, renderers | M8 (M1 proves it on a slice) | NFR-A-01 |
| Contrast, focus, target size, reflow, RTL | M8 | NFR-A-03…06, NFR-I-05 |
| Lighthouse on the playground | M9 | NFR-P-06 |
| Docs examples compiled and executed | M10 | NFR-Q-08 |
| Dependency, packed-contents, licence, API-report gates with negative fixtures | M11 (API report required from M2, in `Engine gates`) | NFR-S-01/07/08, NFR-M-04 |
| Consumer smoke tests, six environments | M11 | NFR-C-02 |

---

## 6. Decisions that must close before M1

Every row is already open in another document; none is new. The roadmap's contribution is to say that they block the build rather than the release, because each one changes what gets built.

**All fifteen were closed on 2026-09-16.** The sheet they were answered on is
`00-m0-decisions.md`; each resolution is written, dated, into the document that
owns it, which is what AC-4 requires. The last column records the answer.

| # | Decision | Where it is open | Consequence of leaving it open | Resolution, 2026-09-16 |
|---|---|---|---|---|
| 1 | **Effort budget** — hours per week and total | `03-nfr.md` N24, §12 #7; Brief §8 | §7's cut ladder cannot be applied, and every milestone's scope is provisional | Number moved: 12–15 hrs/week, ≈ 184 h, 13–15 weeks. Cut ladder declined, first two rungs held in reserve (`03-nfr.md` §10, N24) |
| 2 | **ADR-0008–0020 status** — Proposed to Accepted or revised | `docs/adr/README.md` | Building over a Proposed ADR is building over an open decision | All thirteen accepted as written, dated in each header and in the index |
| 3 | **Calculated items reading other calculated items** | ADR-0009 follow-up, which says acceptance is needed before build | M2 cannot implement step 4 of the cycle | Document order; a reference to a later calculated item reads the previous cycle's value. Folded into ADR-0009's Decision |
| 4 | **Performance anchors** — the NFR-P-04 ceiling | `03-nfr.md` N2; spike S0 | M2's benchmark fixtures and committed baselines are guesses | Ceiling and NFR-P-05 confirmed by S0 over 300 instruments; NFR-P-01/02 re-anchored to 25-item and 500-item fixtures; the 50-instance figure recorded as unvalidated (`03-nfr.md` §1, N2) |
| 5 | **Demo fixture shape** | `02-requirements.md` R9, AC-15.1.3; `03-nfr.md` §12 #1 | M2 needs the fixture; it is also the README demo and playground default | Confirmed as written (`02-requirements.md` R9) |
| 6 | **Screen-reader pairs** | `03-nfr.md` N11, §12 #4 | M8's recurring manual cost, and a published claim | Three: NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari iOS (`03-nfr.md` NFR-A-02, N11) |
| 7 | **Scoring example shape** — docs example and fixture, not a package | `02-requirements.md` R7; `03-nfr.md` §12 #6 | M4 fixture and M10 documentation | Confirmed as written (`02-requirements.md` R7) |
| 8 | **Reference backend dropped** | `03-nfr.md` §12 #5; ADR-0019 already assumes dropped | Scope creep risk in M9 | Dropped (`02-requirements.md` R10, `03-nfr.md` §12 #5) |
| 9 | **A3 lockstep exact `@fhirq/*` versions** | `05-architecture.md` §8 | M0's Changesets configuration and M11's dependency gate | Confirmed; Changesets fixed mode over the four packages is in the tree |
| 10 | **A4 iOS Safari 16.4 floor** | `05-architecture.md` §8 | M1/M7's styling mechanism; lowering it costs bytes against R1 | Confirmed |
| 11 | **A5 snapshot format version, major-only restore** | `05-architecture.md` §8 | M3's snapshot header and its semver meaning | Confirmed |
| 12 | **A6 incremental mutation on PRs, full run nightly** | `05-architecture.md` §8 | M2's spike S2 and M11's release blocker | Confirmed |
| 13 | **AT5 element form participation out of v1** | `05-architecture.md` §9 | M7 scope | Out of v1, recorded as a follow-up (`05-architecture.md` §9) |
| 14 | **NFR-I-06 translation extensions** — excluded, or in scope for an EU buyer | `03-nfr.md` N19 | If it moves in, it touches M2 (parse), M5 (text selection) and M10 (matrix row) | Excluded from v1, as a conformance-matrix row with its reason (`03-nfr.md` NFR-I-06, N19) |
| 15 | **Default locale** — which locale the packages default to, and whether NFR-I-03's single built-in `en` serves a buyer outside English | `03-nfr.md` §12 #9 | M5's display text. ADR-0020 made the locale an explicit option, so this only chooses its default — but unchosen it stops M5 mid-build for a product answer | `en`, single built-in locale, hosts supply others (`03-nfr.md` NFR-I-03, §12 #9) |

---

## 7. Effort reconciliation, and the cut ladder

**The finding.** Summing §2 gives **ASSUMPTION: 184 hours**, excluding the recurring manual screen-reader passes and excluding decision time in M0. NFR-Z-01 assumes 40–60. At the assumed 12–15 hours per week, 184 hours is **13–15 weeks**, not the 3–4 weeks in Brief §8.

The estimate is not padded for the usual reasons: twenty-one blocking CI gates (§5), a mutation-tested engine, two renderers, four tiers, a verified WCAG 2.2 AA surface, a playground and a docs site each carry real hours, and the requirements make all of them `Must`. It is also not a case for doing less carefully — Brief §5 is explicit that nothing ships partial, and `03-nfr.md` §10 says cutting docs, ADRs or accessibility would remove exactly the evidence adopters need.

**Three honest ways out, for the product owner to choose in M0.** *Chosen on 2026-09-16: option 1, with option 2's first two rungs held in reserve. `03-nfr.md` NFR-Z-01 and §10 carry the restated figure and the declined ladder.*

1. **Move the number.** Accept 13–15 weeks at the same weekly pace, and restate NFR-Z-01. Nothing else changes.
2. **Apply the published cut ladder, in its published order** (`03-nfr.md` §10), which trades verification depth rather than width:
   - NFR-Q-03 mutation testing narrowed to the enablement engine only (≈ −6 h);
   - playground extras US-12.4 tier switcher and US-12.5 share links (≈ −5 h, and US-12.4 is `Should`, US-12.5 `Could`);
   - the print stylesheet, already `Should` (≈ −3 h);
   - NFR-A-02 reduced to two screen-reader pairs (recurring manual time, not build hours).
   That ladder recovers roughly 14 hours against a gap of about 124. It closes a ninth of it, which is the honest arithmetic: the ladder was sized for schedule pressure, not for a 3× mismatch.
3. **Cut depth, with product sign-off.** The only reductions that move the number materially are in spec surface — fewer supported item types, dropping repeating groups or dropping the snapshot path — and every one of them is a `Must` today and a row an evaluator will read. If this route is taken, each cut becomes a conformance-matrix row with a reason, which is the shape Brief §5 already commits to.

**The recommendation, and the decision.** Option 1, with option 2's first two rungs held in reserve — recommended here, and taken on 2026-09-16. Width is the competitive position (Brief §5) and depth of verification is the evidence the primary user buys; the schedule is the only one of the three that costs nothing to adjust. M1 exists partly to make this call better informed: it will be the first real data on how fast this codebase is to write.

---

## 8. Epic coverage

Proof that the plan ships every epic, as NFR-Z-02 demands of it.

| Epic | Milestone(s) |
|---|---|
| E01 Ingestion and item types | M2 (parse, load matrix), M5 (control choice), M6/M7 (controls) |
| E02 `enableWhen` | M2 |
| E03 Nested and repeating groups | M2 (structure), M5 (add/remove presentation), M6/M7 (markup) |
| E04 Validation | M3 (rules, surfacing), M4 (cross-field collaborators), M5 (error summary) |
| E05 Emission and retention | M2 (retention), M3 (emission, snapshot) |
| E06 Save and resume | M3 |
| E07 Extension points | M4 (all ports), M7 (default resolver), M10 (scoring example) |
| E08 React adapter | M6 |
| E09 Web component | M7 |
| E10 Customization tiers | M5 (contract), M6/M7 (tiers 1–4), M8 (tokens) |
| E11 Accessibility | M1 (proof), M5 (behaviour), M8 (evidence) |
| E12 Playground | M9 |
| E13 Docs, ADRs, conformance | M0 (ADR statuses), M10 |
| E14 Packaging, CI, release | M0 (fast lane), gate ladder §5, M11 |
| E15 Demo fixture | M0 (shape), M2 (fixture and structural assertions), M4 (scored block) |

---

## 9. Roadmap-level assumptions

Collected for correction, in the style of the other documents. Numeric assumptions elsewhere keep their own registers.

| # | Assumption | Why it matters |
|---|---|---|
| P1 | Every effort figure in §2 and §7 | The whole of §7's reconciliation rests on them; M1 is the first chance to calibrate. **M1's hours were not logged in a form that calibrates this (2026-09-16); M2 is the first reading** |
| P2 | One maintainer, working alone, already holding this design | Parallelism would change §4's critical path, not the total |
| P3 | S1's measurements extrapolate usefully from two items to the full feature set | If the extrapolation is poor, R1 stays open until M7 — the milestone with the least room to absorb it. **Partly held, 2026-09-16:** two methods agree on core (centres 9.0 and 9.7 kB) and diverge on view, react and the element (24.2 against 18.8 kB); each band's high edge is about three times its low. R1 stays open, re-read at each budget gate from M2 rather than at M7 alone |
| P4 | M1's spike code is allowed to be thrown away | If it is treated as production code, the spike stops being cheap and stops being honest |
| P5 | Manual screen-reader passes sit outside the build budget and recur per release | They are a release obligation (NFR-A-02), not a one-off milestone cost |
| P6 | No second adapter, no R5, no FHIRPath enters scope mid-build | Each would reopen decisions this plan treats as closed |
