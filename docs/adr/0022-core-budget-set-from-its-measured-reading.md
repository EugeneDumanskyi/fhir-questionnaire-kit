# ADR-0022 — Core's budget is set from its measured reading once its scope is built

- **Status:** Accepted 2026-09-19
- **Date:** 2026-09-19
- **Traces to:** Brief §4 · US-07.1, US-07.2, US-07.3 · NFR-S-02, NFR-S-03, NFR-U-05 · INV-X-09 · ADR-0005, ADR-0006, ADR-0009, ADR-0012, ADR-0014, ADR-0017, ADR-0021 · `03-nfr.md` §2 (the `ASSUMPTION` note, the S1 verdict, the M2 and M3 readings) · `06-roadmap.md` M4 (plan decision D2), M5 AC-11, M7 · `00-s1-architecture-and-bytes.md` §3

## Context

NFR-S-02 publishes `@fhirq/core` ≤ 14 kB gzipped. It is marked `ASSUMPTION`, and `03-nfr.md` §2 names the failure mode it guards against: a budget set too tight for the code it has to hold, then quietly raised. S1 kept the figure on 2026-09-17, with core's band 5.3–14.1 kB, reaching the budget only at its top edge. ADR-0021 kept it again after core's M2 reading tripped the tripwire. It did that by moving resume code into `@fhirq/core/resume`, which put core's projected centre at 12.3 kB: 9.4–15.7 kB at a 40 % resume share.

**What is measured.** The readings, gzipped and minified:

| Reading | Gzipped | Minified |
|---|---:|---:|
| M2 | 10.16 kB | 28.8 kB |
| M3 | 12.81 kB | 36.8 kB |
| M4 | **14.60 kB** | about 41.6 kB |

M3's reading was already over ADR-0021's centre for M3 and M4 together. `03-nfr.md` §2 raised it as a flag: M4 fits only if it stays under about 3.6 kB minified. M4 costs about 4.8 kB minified and 1.79 kB gzipped. About half of that is new modules: option resolution, scoring, the calculated-value pass and the collaborator guard, 2.4 kB minified together. The rest is the wiring those modules need in the session, the guard, the opener and the definition checks.

The M4 plan's decision D2 set a stop at 13.8 kB, and the build stopped there. Compacting the new modules took the reading from 14.68 kB to 14.57 kB. What remains is mostly M2 and M3 code: the R4 parser (6.6 kB minified) and the definition checks (5.2 kB).

**Core's main entry point is now built to its scope.** M4 closes the last engine milestone:
- M5 builds `@fhirq/core/view`, measured and budgeted separately;
- M6 to M11 build renderers, themes, the playground, docs and release.

What can still reach the main entry point:
- fixes;
- the `Should` half of US-07.3 (scheduling an evaluator from inputs it declares);
- anything a conformance finding in M10 forces.

Those are small against what has been built. This is the first reading that measures the whole scope rather than a share of it. That is the reading `03-nfr.md` §2 said the figure should be rebaselined on.

**The element.** ADR-0021's projection put the element's centres at 22.6 kB (method a) and 26.6 kB (method b), using core's projected 12.3 kB. Using the measured 14.60 kB instead, and keeping S1's view, renderer and theme ranges, moves them to **24.9 kB and 28.9 kB**. Both are over the element's 24 kB. The element measures 18.24 kB today, with the real engine and the spike's view, renderer and theme. ADR-0021 already ranks what happens next and when it is decided: rung 2 at M5 from measured gates, rung 3 at M7 from the measured element.

**The constraint that makes this hard.** Every byte in core's main entry point is also a byte in the element's 24 kB. So any reduction to core is a reduction to the element, and any figure raised for core is paid again by the element. The question is whether core's number moves, or the scope just built does.

## Options considered

**A. Keep 14 kB and cut M4 scope.** Drop or defer a port: scoring functions, the evaluator seam, or the sanitizer. Rejected.
- Each is in M4's scope and traces to a `Must` story or invariant: US-07.2, US-07.3, INV-X-06.
- Cutting one re-opens the cut ladder, which R3 declined in writing. Bytes alone were not accepted as a reason then.
- The two smallest candidates, scoring (0.74 kB minified) and the evaluator pass (0.48 kB), save about 0.45 kB gzipped between them. That is short of the 0.60 kB needed.

**B. Move collaborators behind another entry point,** the way ADR-0021 moved resume code. For example, a `@fhirq/core/ports` subpath that installs scorers and the evaluator into a session. Rejected.
- **Resume was separable because it runs outside the cycle.** Scorers and the evaluator run inside it, at steps 4 and 5 of ADR-0009. A separate entry point would need a public registration hook that the session calls every cycle. That hook would still live in the main entry point. So would its guard, because the rules in M3 need the guard anyway.
- It would spend symbols from the two NFR-U-05 leaves after M4.
- Option resolution cannot move at all. The element ships a default resolver (ADR-0012), so it needs resolution anyway.
- The saving would be the scoring and evaluator modules minus the hook, under 0.45 kB. That is short of the 0.60 kB needed. It would also leave the element no smaller for hosts that score, which is the case US-07.2 exists for.

**C. Keep compacting until the reading is under 14 kB.** Rewrite the large M2 and M3 modules for bytes, starting with the R4 parser and the definition checks. For example, turn the parser into a table and merge lenient branches. Rejected.
- Those modules are the codec seam (ADR-0016) and the lenient/strict matrix. Both are mutation-tested and settled.
- Rewriting them for bytes, mid-milestone, trades readability and a stable test history for a yield nobody has measured.
- The first pass on the M4 modules shows how steep the curve is: 0.11 kB for a compaction of the code with the most slack.
- It would also only hold the number until the next fix. A figure held that way is the quiet raise §2 warns about, deferred.

**D. Amend NFR-S-02's core figure to the measured reading plus a stated margin, once, now that the scope is built.** Chosen.

## Decision

**1. `@fhirq/core` ≤ 15 kB gzipped** (15,000 bytes, main entry point, excluding `@fhirq/core/resume` as ADR-0021 measures it). This replaces 14 kB in NFR-S-02. It is no longer an `ASSUMPTION`: it is set from a measured reading of the finished scope.

**2. The margin is 0.40 kB gzipped,** about 1.1 kB minified at M4's ratio. It is sized for what can still reach the main entry point: fixes, US-07.3's `Should` scheduling, and conformance findings. That work is small beside what has been built. It is not sized for a new port or a new engine feature. Any such work lands with its own reading, and an ADR if it does not fit.

**3. The evidence** for the figure:
- The measured 14.60 kB sits inside ADR-0021's split-core band (9.4–15.7 kB), below its top edge.
- It is 0.3 kB under S1's single-entry centre of about 15 kB for all of core (`03-nfr.md` §2).
- The projections were right about the size of the whole. They were wrong about where the centre fell, and they were wrong in the low direction, as S1 §3.5's density bias predicted.
- The new figure is not raised to a projected band edge. It is the measured figure plus a margin argued from the work that remains.

**4. Nothing else moves.**
- `@fhirq/core/resume` stays ≤ 4 kB.
- The element stays ≤ 24 kB and the IIFE stays ≤ 30 kB.
- ADR-0021's ladder stands as written. Rung 2 is decided at the end of M5, from measured core, view and theme. Rung 3 is decided at M7, from the measured element.
- This ADR records that, on the arithmetic above, rung 2's trigger is now expected to fire. That is a forecast, not the trigger itself.

**5. The gate stays blocking** at the new figure. `scripts/budgets.json` sets `@fhirq/core` to 15,000 bytes, and `@fhirq/core` stays in `gated`.

## Consequences

**Benefits**
- **Scope stays whole.** M4's ports ship as the roadmap and the ADRs they implement describe them. No `Must` is cut for a number.
- **The published figure is a measurement.** An adopter reading "15 kB" reads what the finished engine weighs, with a stated margin. They do not read a projection that has already been exceeded once.
- **It is raised once, in the open,** at the reading §2 named for rebaselining. It is not raised a little at each milestone.
- **The element's decisions stay where ADR-0021 put them.** They are taken from measured numbers at M5 and M7, not re-opened here from a projection.

**Costs accepted**
- **A published figure goes up by 1 kB.** Brief §4's competitive claim is about 7 % weaker for core. That is the cost §2's `ASSUMPTION` note warned of. This ADR pays it with a measured reason rather than avoiding it.
- **The element's centres move to about 24.9 and 28.9 kB.** Rung 2, table-driven patchers, is now likely at M5. Rung 3, raising the element's figure, is more likely at M7 than ADR-0021 judged.
- **The margin is thin.** 0.40 kB leaves room for fixes and one `Should` feature. It does not leave room for a new port or a second evaluator pass. Such a change must either find bytes of its own or come with an ADR.
- **The 13.8 kB stop did its job and was still passed.** A future milestone that meets a number this way will have this ADR as precedent, which makes raising a number easier to reach for. Decision 2's scope limit is what keeps that from becoming a habit.

**Verification**
- **Budget gate:** `pnpm measure --check` fails when `@fhirq/core`'s main entry point is over 15,000 bytes gzipped (`scripts/budgets.json`, `gated`). It runs in the required `Engine gates` job.
- **The reading is recorded:** `03-nfr.md` §2 carries the M4 reading, 14.60 kB. NFR-S-02's row and §11 N3 name 15 kB, citing this ADR.
- **The element forecast is checked by the M5 gate reading:** `06-roadmap.md` M5 AC-11 records the element projection from measured core, view and theme. If its centre is over 24 kB, M7 builds table-driven patchers (ADR-0021 rung 2).

**Follow-ups**
- **The margin** is read at every milestone's close-out that touches core, in `03-nfr.md` §2. It is closed by M11's release reading.
- **The element forecast** is closed by the M5 reading (rung 2) and by M7's element gate (rung 3), as ADR-0021 already provides. *Closed 2026-09-25 by ADR-0024.*
