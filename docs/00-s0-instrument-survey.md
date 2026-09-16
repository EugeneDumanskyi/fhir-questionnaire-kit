# S0 — Instrument-size survey

*Spike for M0 (`06-roadmap.md` §3). Timebox 2 h, no product code. Question: is
NFR-P-04's ceiling — 1,000 items, 500 `enableWhen` conditions, 50 instances of a
repeating group, 20 items per instance — real? Output: this table and a verdict,
feeding §6 decision 4 and `03-nfr.md` §11 N2.*

**Run date:** 2026-09-16. **Sample:** 300 distinct `Questionnaire` resources.

---

## 1. Method

Two public FHIR R4 endpoints that publish real instrument libraries were paged
with `_count=50` and every distinct resource counted by script. "Distinct" is
`url|version`, falling back to `id` where no canonical URL is published.

| Library | Endpoint | Resources on server | Sampled | What it holds |
|---|---|---|---|---|
| NLM LHC Forms | `lforms-fhir.nlm.nih.gov/baseR4` | 3,350 | 200 | LOINC-derived panels: MDS, OASIS, FACIT, APTA, NAACCR, newborn screening |
| CSIRO Smart Forms | `smartforms.csiro.au/api/fhir` | 139 | 100 | SDC-authored Australian primary-care forms: ATSI health checks, aged care, QI datasets |

Per resource the script recorded item count (recursive), `enableWhen` condition
count, group-nesting depth, longest `enableWhen` dependency chain, items with
`repeats`, items per repeating group, answer-option counts, and the item-type
mix. Counting is structural: it reads `Questionnaire` definitions only.

**What the method cannot see.** Runtime facts are not in a `Questionnaire`. The
number of *instances* a repeating group actually reaches is a property of a
`QuestionnaireResponse`, and no `QuestionnaireResponse` was sampled. NFR-P-04's
"50 instances" is therefore untouched by this survey and stays an assumption
(§4 below).

**Sample bias, stated plainly.** Two libraries, one North American and one
Australian. No NHS, no EU national PRO set, no vendor-proprietary library. 268
of 300 carry `status: draft`, which on these servers reflects publication
workflow rather than quality. The NLM slice is LOINC panel conversions, which
are uniformly flat; the CSIRO slice is hand-authored SDC, which is where all the
conditional logic in the sample lives. Two libraries is enough to anchor size,
and not enough to claim the distribution is the world's.

---

## 2. Size distribution

Item counts, recursive, across all 300.

| Statistic | Items |
|---|---|
| median | 22 |
| p75 | 76 |
| p80 | 183 |
| p90 | 506 |
| p95 | 697 |
| p99 | 1,007 |
| max | 3,264 |

| Band | Instruments |
|---|---|
| 1–10 items | 86 |
| 11–50 | 123 |
| 51–100 | 20 |
| 101–200 | 14 |
| 201–500 | 27 |
| 501–1,000 | 27 |
| > 1,000 | 3 |

**The distribution is bimodal.** 209 of 300 instruments are ≤ 50 items; 57 are
≥ 200; only 34 sit between 51 and 200. The 51–200 band is the trough, and
NFR-P-01/02's 200-item benchmark anchor sits in it (200 items is the 81st
percentile).

The three instruments above 1,000 items are registry-scale assessment
instruments (MDS v3.0 RAI at 3,264, the MDS public-health-EOC data set at 1,083,
FACIT-Cancer at 1,007).

---

## 3. Structure and logic

| Measure | max | p99 | p95 | p90 | median | Instruments > 0 |
|---|---|---|---|---|---|---|
| `enableWhen` conditions per instrument | 161 | 158 | 5 | 2 | 0 | 44 / 300 |
| `enableWhen` dependency-chain length | 5 | 3 | 1 | — | 0 | 43 / 300 |
| group-nesting depth | 10 | 8 | 7 | 6 | 3 | 300 / 300 |
| items with `repeats` | 70 | 59 | 9 | 3 | 0 | 39 / 300 |
| repeating *groups* | 15 | 14 | 5 | 2 | 0 | 39 / 300 |
| items inside one repeating group | 18 | — | 18 | 13 | 8 | 33 groups |
| answer options on one item | 254 | 241 | 137 | 48 | 5 | 207 / 300 |

**Size and logic are anti-correlated, and the split is by authoring style.**

| Slice | n | items median / p90 / max | with `enableWhen` | with `repeats` | with calculated expressions | max depth |
|---|---|---|---|---|---|---|
| NLM (LOINC panels) | 200 | 23 / 550 / 3,264 | **0** | **0** | **0** | 8 |
| CSIRO (SDC-authored) | 100 | 20 / 157 / 821 | 44 | 39 | 31 | 10 |

Not one of the 200 LOINC-derived panels carries a single `enableWhen`, a
`repeats`, or a calculated expression. Every conditional, repeating and
calculated behaviour in the sample is in the 100 hand-authored SDC forms, which
are the smaller half. The worst *combined* instrument observed is the
Aboriginal and Torres Strait Islander Health Check: 821 items, 78 conditions,
70 repeating items, depth 8. The most conditional is its Phase 3 variant: 697
items, 161 conditions, depth 8, chain length 5.

Item-type mix across the sample, 40,066 items:

| Type | Count | | Type | Count |
|---|---:|---|---|---:|
| `choice` | 18,714 | | `integer` | 283 |
| `group` | 6,091 | | `open-choice` | 224 |
| `display` | 5,064 | | `quantity` | 194 |
| `decimal` | 4,256 | | `dateTime` | 67 |
| `string` | 3,515 | | `attachment` | 20 |
| `text` | 889 | | `time` | 3 |
| `boolean` | 414 | | `url` | 2 |
| `date` | 328 | | `reference` | 2 |

`choice` is 47% of all items, and `choice` + `group` + `display` is 74%.
`time`, `url` and `reference` are effectively absent. 207 instruments carry
inline `answerOption`, 62 use `answerValueSet`, and 250 use the
`questionnaire-itemControl` extension. `enableBehavior: any` appears in 14.

---

## 4. Verdict against NFR-P-04 and NFR-P-05

| Figure | Assumed | Observed | Verdict |
|---|---|---|---|
| Item ceiling | 1,000 | p99 = 1,007; max 3,264 | **Confirmed, and tighter than anyone guessed.** The assumed ceiling lands within 1% of the observed 99th percentile |
| Items per repeat instance | 20 | max 18, p95 18, median 8 | **Confirmed** |
| Group nesting (NFR-P-05) | 10 | max 10, p95 7 | **Confirmed, exactly at the ceiling** |
| `enableWhen` conditions | 500 | max 161 | **Headroom, 3.1×.** Not observed; not an order of magnitude either |
| `enableWhen` chain (NFR-P-05) | 10 | max 5 | **Headroom, 2×** |
| Repeat instances | 50 | **not observable** from `Questionnaire` definitions | **Still an assumption.** Needs a `QuestionnaireResponse` sample, which this spike did not take |

Neither kill criterion fired: 300 usable instruments were found, well over the
~10 floor, and no figure is an order of magnitude above observation — the widest
gap is 3.1×.

**One finding argues for a change, and it is not the ceiling.** NFR-P-01 and
NFR-P-02 are anchored to a single 200-item questionnaire, which the survey
places in the trough of a bimodal distribution — larger than 81% of real
instruments and a third the size of the ones that will actually hurt. A single
200-item benchmark fixture measures a size that is common in neither mode.

**Recommendation carried to §6 decision 4:**

1. **Confirm NFR-P-04's ceiling and NFR-P-05 as written.** Three of the four
   observable figures are confirmed within noise; the other two are honest
   headroom and cost nothing to keep, since no code is sized by them.
2. **Re-anchor NFR-P-01/02 to two benchmark fixtures rather than one:** ~25
   items (the median, the case a clinic meets all day) and ~500 items (the p90,
   the registry-scale case). Keep the existing millisecond figures against the
   small anchor and set the large one from M2's first measurement.
3. **Record that the 50-instance figure is unvalidated** and validate it in M2
   from `QuestionnaireResponse` data, or leave it as a deliberate design
   headroom with that said in writing.
4. **Shape M2's fixtures from the anti-correlation:** a large flat instrument
   and a small deeply conditional one are two different performance problems.
   The sample says both exist and that no real instrument is both at once, so a
   combined worst case is a synthetic stress fixture, labelled as such, not a
   claim about the domain.

A further consequence for M2's load matrix, outside NFR-P-04: `choice` is
half of all real items and `time`, `url` and `reference` are close to
unused. Depth of support in `choice` — options, `answerValueSet`, `itemControl`,
option lists into the hundreds — buys more conformance than breadth across the
rare types.

---

## 5. Reproducing this

Ad-hoc scripts against the two endpoints above; neither the scripts nor the
downloaded bundles are committed, because they are a 100 MB point-in-time copy
of someone else's library and the repository instructions keep spec-derived
material out of the tree. The endpoints are public and unauthenticated; the
paging and the counting rules are described in §1 in enough detail to redo.
Two of the seven NLM pages were truncated by the server mid-response and were
dropped rather than partially parsed, which is why the NLM sample is 200 and
not 250.
