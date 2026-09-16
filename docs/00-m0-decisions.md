# M0 — decision sheet

*Working document for the fifteen rows of `06-roadmap.md` §6. Every row is
already open somewhere else; this sheet exists so they can be answered in one
sitting rather than found one at a time. Once answered, each resolution is
written, with a date, into the document that owns it, and this sheet is left
behind as the record of what was asked.*

**Status:** answered 2026-09-16. Every row was answered as recommended, and each
resolution is now written, with that date, into the document that owns it — this
sheet is the record of what was asked, not the place the answers live. Roadmap §6
carries the one-line summary of each; the owning documents carry the reasoning.

---

## 1. Effort budget (NFR-Z-01, N24, §12 #7)

**The finding.** `06-roadmap.md` §7 sums the milestones at **ASSUMPTION: 184
hours**. NFR-Z-01 assumes 40–60. At 12–15 hours a week that is **13–15 weeks**,
not the 3–4 in Brief §8. The gap is about 124 hours.

| Option | What it means |
|---|---|
| **(a) Move the number** | Accept 13–15 weeks at the same weekly pace and restate NFR-Z-01. Nothing about the product changes |
| (b) Apply the published cut ladder | `03-nfr.md` §10, in order: mutation testing narrowed to the enablement engine (≈ −6 h), playground tier switcher and share links (≈ −5 h), print stylesheet (≈ −3 h), two screen-reader pairs instead of three (recurring manual time). Recovers ≈ 14 h of a ≈ 124 h gap |
| (c) Cut spec depth, with sign-off | Fewer item types, or drop repeating groups, or drop the snapshot path. Each is a `Must` today; each cut becomes a conformance-matrix row with a reason |

**Recommendation: (a), with (b)'s first two rungs held in reserve.** It is §7's
own recommendation and the arithmetic supports it: the ladder closes a ninth of
the gap, and (c) trades away the width that Brief §5 calls the competitive
position. The schedule is the only one of the three that costs nothing to move.

**Answer, 2026-09-16:** **(a) Move the number.** 12–15 hrs/week confirmed, total restated at ≈ 184 hours / 13–15 weeks. The cut ladder is declined in writing, with its first two rungs held in reserve for M1's measured pace. Written into `03-nfr.md` NFR-Z-01, §10 and N24.

---

## 2. ADR-0008–0020 status

Thirteen ADRs sit at `Proposed`. Building over a Proposed ADR is building over
an open decision, which the repository instructions forbid.

**Recommendation: accept all thirteen as written.** None has been contradicted
by later work: ADR-0020 was written last and is consistent with 0007 and 0013,
and §8's A1/A2 and §9's AT1–AT4 — the four places where later analysis pushed
back — were already folded in on 2026-09-15. Any ADR to be revised is revised in
the same commit that flips its status.

**Answer, 2026-09-16:** **Accept all thirteen as written.** No revisions. Each ADR header carries `Accepted` plus an `Accepted: 2026-09-16` line; `docs/adr/README.md` carries the dated status.

---

## 3. Calculated items reading other calculated items (ADR-0009 follow-up)

ADR-0009's follow-up says in terms that this "needs acceptance before build",
and M2 cannot implement step 4 of the cycle without it.

| Option | What it means |
|---|---|
| **(a) Document order** | A calculated item that reads another reads the previous cycle's value; evaluation follows document order. ADR-0009's own proposal |
| (b) Reject at load | A questionnaire whose calculated items reference each other is refused |

**Recommendation: (a).** It is what ADR-0009 proposed, and (b) costs a detection
pass over calculated-item expressions that the engine otherwise never needs to
run. The cost of (a) is a documented one-cycle lag, which becomes a
conformance-matrix row rather than a surprise.

**Answer, 2026-09-16:** **(a) Document order,** with a later-referencing calculated item reading the previous cycle's value. Folded out of ADR-0009's Follow-ups and into its Decision section.

---

## 4. Performance anchors (N2, NFR-P-04, NFR-P-05) — informed by spike S0

S0 surveyed **300 real instruments** from two production libraries
(`00-s0-instrument-survey.md`). Neither kill criterion fired.

| Figure | Assumed | Observed | |
|---|---|---|---|
| Item ceiling | 1,000 | p99 = 1,007, max 3,264 | confirmed |
| Items per repeat instance | 20 | max 18 | confirmed |
| Group nesting | 10 | max 10 | confirmed |
| `enableWhen` conditions | 500 | max 161 | 3.1× headroom |
| `enableWhen` chain | 10 | max 5 | 2× headroom |
| Repeat instances | 50 | **not observable** from definitions | still an assumption |

S0 also found the size distribution is **bimodal** — 209 of 300 instruments are
≤ 50 items, 57 are ≥ 200, and only 34 sit in between — and that NFR-P-01/02's
single 200-item benchmark anchor sits in the trough. And it found that size and
logic are **anti-correlated**: not one of the 200 LOINC-derived panels carries a
single `enableWhen`, `repeats` or calculated expression.

| Option | What it means |
|---|---|
| **(a) Confirm the ceiling, re-anchor the benchmarks** | NFR-P-04 and NFR-P-05 stand as written. NFR-P-01/02 move from one 200-item fixture to two: ~25 items (the median) and ~500 (the p90). The 50-instance figure is recorded as unvalidated and checked in M2 |
| (b) Confirm everything as written | Keep the single 200-item anchor too. Cheapest; measures a size common in neither mode |
| (c) Re-anchor the ceiling down | e.g. 250 conditions, chain 5. Tightens the published claim to what was observed, and narrows the headroom for an instrument nobody surveyed |

**Recommendation: (a).** The ceiling is better anchored than anyone expected —
1,000 items landed within 1% of the observed 99th percentile. The benchmark
anchors are the part the survey actually contradicts, and they are cheap to fix
now and expensive after M2 commits baselines.

**Answer, 2026-09-16:** **(a) Confirm the ceiling, re-anchor the benchmarks.** NFR-P-04 and NFR-P-05 stand; NFR-P-01/02 now measure two fixtures, 25 items and 500; the 50-instance figure is recorded as unvalidated and carried into M2. Written into `03-nfr.md` §1 and N2.

---

## 5. Demo fixture shape (R9, AC-15.1.3, §12 #1)

Original "pre-visit intake" fixture, with PHQ-9 as a flat secondary fixture for
the scoring documentation.

**Recommendation: confirm as written.** An original fixture can be shaped to
exercise nested groups, repeats, `enableWhen` cascades and validation in one
artefact, which a real instrument would only do by accident. S0 supports it:
real instruments are either large and flat or small and conditional, so a demo
that shows both behaviours is necessarily authored.

**Answer, 2026-09-16:** **Confirmed as written.** `02-requirements.md` R9, `03-nfr.md` §12 #1.

---

## 6. Screen-reader pairs (N11, §12 #4)

Three pairs per release, manually, recurring. The cut ladder's fourth rung
reduces it to two. **Which three** is the part that needs an answer.

**Recommendation: three, and these three** — NVDA + Firefox (Windows), JAWS +
Chrome (Windows), VoiceOver + Safari (iOS). JAWS is what the buyer's own
accessibility team uses; NVDA is what an evaluator can reproduce for free; and
VoiceOver on iOS is the pair that also exercises A4's iOS Safari 16.4 floor,
which ADR-0014's styling mechanism depends on.

**Answer, 2026-09-16:** **Three, and these three:** NVDA + Firefox (Windows), JAWS + Chrome (Windows), VoiceOver + Safari (iOS). Written into `03-nfr.md` NFR-A-02, N11 and §12 #4 — NFR-A-02's row previously named VoiceOver on macOS, and now names JAWS + Chrome instead.

---

## 7. Scoring example shape (R7, AC-07.2.3, §12 #6)

**Recommendation: confirm as written** — PHQ-9/GAD-7 scoring ships as a
documented example and a test fixture, not as a published package. A fifth
published package reopens ADR-0008's lockstep surface and NFR-S-01's dependency
claim for something an adopter copies in twenty lines.

**Answer, 2026-09-16:** **Confirmed as written.** `02-requirements.md` R7, `03-nfr.md` §12 #6.

---

## 8. Reference backend (R10, §12 #5)

**Recommendation: drop.** ADR-0019 already assumes it is dropped, it serves no
principle in Brief §6, and it adds a Docker surface that can break on an
evaluator's machine — the one place the kit cannot afford to fail.

**Answer, 2026-09-16:** **Dropped.** `02-requirements.md` R10, `03-nfr.md` §12 #5.

---

## 9. A3 — lockstep exact `@fhirq/*` versions (`05-architecture.md` §8)

**Recommendation: confirm.** Changesets is configured in fixed mode over the
four packages as part of this milestone, and "install any two and they agree" is
only true if it is mechanical. Ranges would make NFR-S-01's dependency claim
unprovable.

**Answer, 2026-09-16:** **Confirmed.** `05-architecture.md` §8 A3. Changesets fixed mode over the four packages is in the tree, and cross-dependencies are `workspace:0.0.0`.

---

## 10. A4 — iOS Safari 16.4 floor (`05-architecture.md` §8)

**Recommendation: confirm.** 16.4 is where constructable stylesheets arrive, and
ADR-0014's CSP-safe styling has no fallback below it that is not a second
mechanism carried in the bundle — against R1, which §1 already calls
arithmetically tight.

**Answer, 2026-09-16:** **Confirmed.** `05-architecture.md` §8 A4.

---

## 11. A5 — snapshot format version, major-only restore (`05-architecture.md` §8)

**Recommendation: confirm.** Without it, "snapshots are not a migration format"
has no mechanical meaning across a library upgrade, and AC-05.3.3 has nothing to
assert.

**Answer, 2026-09-16:** **Confirmed.** `05-architecture.md` §8 A5.

---

## 12. A6 — incremental mutation on PRs, full run nightly (`05-architecture.md` §8)

**Recommendation: confirm.** A full run does not fit NFR-M-07's ten minutes
(ADR-0018 option G, rejected for exactly this). The accepted cost is that a
change weakening tests in an unchanged file is caught nightly rather than at
merge, and the nightly run blocks release.

**Answer, 2026-09-16:** **Confirmed.** `05-architecture.md` §8 A6.

---

## 13. AT5 — element form participation (`05-architecture.md` §9)

Should `<fhir-questionnaire>` be form-associated, so a response submits with a
surrounding `<form>`?

**Recommendation: out of v1, recorded as a follow-up.** It is in no requirement,
it is a second serialisation path beside the emitted `QuestionnaireResponse`,
and `ElementInternals` form association is itself Safari 16.4+ — so it is
available to add later without moving A4.

**Answer, 2026-09-16:** **Out of v1,** recorded as a follow-up. `05-architecture.md` §9 AT5.

---

## 14. NFR-I-06 translation extensions (N19)

The SDC translation extensions, which carry per-language text inside the
`Questionnaire` itself.

**Recommendation: excluded for v1 — but this is a market call, not a technical
one.** If a European buyer is in view it may be table stakes, and it moves M2
(parse), M5 (text selection) and M10 (matrix row). Cheaper to decide now than to
discover in M5.

**Answer, 2026-09-16:** **Excluded from v1,** as a conformance-matrix row carrying its reason. `03-nfr.md` NFR-I-06, N19. Revisit before v1.1 if a European buyer comes into view.

---

## 15. Default locale (N19, §12 #9)

ADR-0020 settled the mechanism: `view/` formats, and the locale is an explicit
presentation option. What remains is which locale the packages default to, and
whether NFR-I-03's single built-in `en` serves a buyer outside English.

**Recommendation: `en` as the default, one built-in locale, hosts supply the
rest.** The catalogue is ≤ 45 keys (NFR-I-02) and the mechanism is already
explicit, so a second built-in locale adds maintenance and bytes without adding
capability. Related to row 14: if translation extensions come in, this answer
should be revisited with them.

**Answer, 2026-09-16:** **`en`, single built-in locale, hosts supply the rest.** `03-nfr.md` NFR-I-03, §12 #9.
