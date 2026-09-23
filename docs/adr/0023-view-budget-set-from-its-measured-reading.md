# ADR-0023 — The view's budget is set from its measured reading once its scope is built

- **Status:** Accepted 2026-09-23
- **Date:** 2026-09-23
- **Traces to:** Brief §4 · AC-01.2.4, AC-03.3.1, AC-04.2.1, AC-04.2.2, AC-11.2.1, AC-11.3.1, AC-11.3.2 · NFR-S-02, NFR-S-03, NFR-I-01, NFR-I-02, NFR-I-04, NFR-Q-01, NFR-Q-03 · INV-P-03–06 · BC6 · ADR-0007, ADR-0013, ADR-0020, ADR-0021, ADR-0022 · `03-nfr.md` §2 (the `ASSUMPTION` note, the S1 verdict), §11 N3 · `05-architecture.md` §6.1, §8 A1 · `06-roadmap.md` M5 (plan decision D9, AC-7, AC-11) · `00-s1-architecture-and-bytes.md` §3 · NFR-M-05 topic *core/adapter/element layering*

## Context

NFR-S-02 publishes `@fhirq/core/view` ≤ 5 kB gzipped. The figure came from `05-architecture.md` §8 A1 when Architecture B added the entry point, and it is marked `ASSUMPTION`. S1 kept it on 2026-09-17 with a band of 3.0–9.0 kB (centres 4.3 kB by method (a) and 6.2 kB by method (b)). The S1 verdict named the view as "the likeliest first overrun" and deferred the question to the gate's first reading, at M5.

**What is measured.** M5 builds the view's whole scope: every BC6 behaviour that is not markup (`06-roadmap.md` M5). The reading, on 2026-09-23:

| | Minified | Gzipped |
|---|---:|---:|
| `@fhirq/core/view`, measured as the gate measures it (`@fhirq/core` external, the kernel modules the view imports counted) | 19.8 kB | **7.77 kB** |
| The same, without the modules `@fhirq/core` already bundles (the resume entry's method, ADR-0021) | 18.8 kB | 7.36 kB |
| The `en` message catalogue alone, 38 keys | 2.1 kB | 0.77 kB |

The view is 1,017 source lines, inside S1 method (b)'s 1,000–1,700, and it compresses at 0.39. Method (a) put it at 9.1–17.0 kB minified, and the build is 19.8 kB. It sits above that range for the reason S1 §3.5 gave first: scope counts were estimates. Two pieces of scope were not in either estimate. One is the drafts M3 plan D2 moved into the view (INV-P-06), with the entry parsing they need. The other is the entries of a repeating question (AC-03.3.1).

**The plan's stop-line.** M5 plan decision D9 set a stop at 4.6 kB: trim, and if trimming cannot hold 5 kB, write an ADR that amends the figure from the measured reading, as ADR-0022 did for core. The stop was passed on the way to a whole view, because trimming needs the finished code and its tests as a safety net. A trimming pass that changes no behaviour saved 0.03 kB. The rest is dense already: long names repeat, but gzip absorbs repeats. A tenth of the figure is text the catalogue must hold (NFR-I-01). This ADR is D9's second branch.

**What the 5 kB stands for.** The view's figure is not the element's. The element's 24 kB already counts core, view and theme (NFR-S-02), so a view byte is paid in the element whatever the view's own figure says. The view's figure is what a tier-4 host pays on top of core (ADR-0013). React's budget excludes it (A2).

**The constraint that makes this hard.** Every behaviour in the view is written once so that it is not written twice: once in React and once in the element (ADR-0007, option A rejected). A byte cut from the view either disappears, which means a `Must` goes, or moves into both renderers and is paid twice.

## Options considered

**A. Keep 5 kB and cut the view's scope.** It would need 2.8 kB gzipped, about 7 kB minified at the view's ratio. Rejected.
- What is large enough to cut is each tied to a requirement:
  - drafts and entry parsing (INV-P-06, AC-04.2.2): about 3 kB minified;
  - `Intl` formatting and its cache: 2.0 kB minified, which ADR-0020 decides belongs here, and which cannot be cut without breaking it;
  - per-rule issue text with the limit and the value entered (AC-04.2.1);
  - a repeating question's entries (AC-03.3.1).
- Cutting them reopens the cut ladder, which R3 declined in writing.
- Moving them into the renderers is ADR-0007's rejected option A. React's 6 kB would pay for them a second time, and the code would move under NFR-Q-02's weaker gates, away from the NFR-Q-01 and NFR-Q-03 gates the view runs under.
- **This is the only option that also helps the element,** by up to 2.8 kB. That is the case for it, and it is weighed under Costs accepted.

**B. Measure the view without the kernel modules `@fhirq/core` bundles,** as ADR-0021 measures the resume entry. Rejected.
- It removes 0.40 kB of a 2.76 kB gap, so the figure still has to move.
- It describes a published layout that does not exist yet. Whether the view's `dist` shares the kernel with core's or carries its own copy is M11's build question (`pnpm build`). Until then, the gate's method is the one that describes what a host downloads.
- Changing the method and the figure in one decision would hide how much of the move each accounts for.

**C. Keep compacting until the reading is under 5 kB.** Rejected.
- A first pass that changes no behaviour yielded 0.03 kB.
- The largest remaining code is the command layer and the tree builder. Compacting it further means trading the identity rule (AC-4) and the complexity limit (NFR-M-02) for bytes.
- As ADR-0022 said of core, a figure held this way is the quiet raise §2 warns about, only deferred.

**D. Amend NFR-S-02's view figure to the measured reading plus a stated margin, once, now that the scope is built.** Chosen.

## Decision

**1. `@fhirq/core/view` ≤ 8.2 kB gzipped** (8,200 bytes). It replaces 5 kB in NFR-S-02. It is measured as the gate measures it today: `@fhirq/core` external, and the kernel modules the view imports counted. It is no longer an `ASSUMPTION`: it is set from a measured reading of the finished scope.

**2. The margin is 0.44 kB gzipped,** about 1.1 kB minified at the view's ratio. It is sized for what can still reach the view:
- fields M6 and M7 find a renderer needs, which is where R2 could still fail quietly;
- fixes;
- the follow-up on a draft that does not block completion (M5 close-out).

It is not sized for help text (M5 plan D5, option b), a second locale, or any new behaviour. Each of those lands with its own reading, and with an ADR if it does not fit.

**3. The gate blocks from acceptance.** `scripts/budgets.json` sets `@fhirq/core/view` to 8,200 bytes and adds it to `gated`. The `Engine gates` step names it (M5 AC-7).

**4. Nothing else moves.**
- `@fhirq/core` stays at 15 kB and `@fhirq/core/resume` at 4 kB.
- The element stays at 24 kB and the IIFE at 30 kB. The view's bytes are in the element's figure already.
- ADR-0021's ladder stands. This ADR records the reading that decides rung 2 (Consequences).

## Consequences

**Benefits**
- **BC6 stays written once.** The drafts, the formatting, the issue text and the repeating-question entries stay in the one layer tested under NFR-Q-01 and NFR-Q-03, and are not written twice.
- **The published figure is a measurement.** A tier-4 host reading "8.2 kB" reads what the finished presentation model weighs, not a projection its first reading exceeded by half.
- **It is raised once, in the open,** at the reading S1 named. It is not raised a little at each milestone.

**Costs accepted**
- **A published figure goes up by 64 %.** It is the view's alone, and the largest move of any budget so far. A tier-4 host pays 3.2 kB more than was published. That is the cost §2's `ASSUMPTION` note warned of, paid with a measured reason.
- **The element is not helped.** The element pays the view's 7.77 kB whatever this figure says. **ADR-0021's rung-2 trigger fires on this reading.** Projected from the measured gates, as that ADR specifies, the element's centre is about 29 kB with the theme slice and about 32 kB with S1's theme band. That uses measured core (14.68 kB), measured view less the kernel it shares with core (7.4 kB), S1's element renderer (13.0–22.6 kB minified) and the theme, at the ratios S1 used for bundles that size. Rebuilt instead from the element as it is built today, it comes to about 28 kB and 31 kB at the element's measured 0.35 ratio. S1's 0.22–0.31 band for bundles over 60 kB would put it at 21–24 kB, but the measured element does not compress that well. On every reading but that one, rung 2 (table-driven patchers, −0.8 to −1.7 kB) does not bring the element under 24 kB. **Rung 3, raising the element's figure by ADR at M7, is now the expected outcome.** Option A is the one choice that would have narrowed that gap, and this ADR does not take it: the gap is 5–8 kB, and option A closes at most 2.8 kB of it at the price of `Must`s.
- **The margin is thin.** At 0.44 kB, a renderer-driven field or two fits. A new view behaviour must find bytes of its own or come with an ADR.
- **A second budget raised from a reading, one milestone after the first.** ADR-0022's decision 2 guarded against habit, and this ADR is the second use of that path. What keeps it from being a habit is that the figures raised are the two whose scope is now built (core, view). The three still ahead (React, element, themes) are read at their own gates, with the element's decided by ADR-0021's rung 3.

**Verification**
- **Budget gate:** `pnpm measure --check` fails when `@fhirq/core/view` is over 8,200 bytes gzipped (`scripts/budgets.json`, `gated`), in the required `Engine gates` job. The resume-path inputs check already covers the view (ADR-0021).
- **The reading is recorded:** `03-nfr.md` §2 carries the M5 reading (7.77 kB) and the rung-2 projection. NFR-S-02's row and §11 N3 name 8.2 kB, citing this ADR, and `05-architecture.md` §6.1's row follows.
- **The scope limit is checked where it is spent:** the M6 and M7 close-outs read the view's figure in `03-nfr.md` §2, as ADR-0022 has each close-out read core's.

**Follow-ups**
- **Whether the published `dist` shares kernel modules between `@fhirq/core` and `@fhirq/core/view`** (option B's premise) is closed by M11's build. If it does, the view's gate method moves to the resume entry's, and the figure is re-read then, not raised again.
- **Rung 3** is closed by M7's element gate, as ADR-0021 provides.
