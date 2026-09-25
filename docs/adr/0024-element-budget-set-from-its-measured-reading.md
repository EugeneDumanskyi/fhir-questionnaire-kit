# ADR-0024 — The element's and the IIFE's budgets are set from M7's measured reading, with the theme M8 still grows

- **Status:** Proposed
- **Date:** 2026-09-25
- **Traces to:** Brief §4 · AC-09.1.1 · NFR-S-02, NFR-S-03, NFR-C-07 · ADR-0007, ADR-0014, ADR-0021, ADR-0022, ADR-0023 · `03-nfr.md` §2 (the `ASSUMPTION` note, the S1 verdict, the M5 rung-2 reading), §11 N3 · `05-architecture.md` §6.1 · `06-roadmap.md` M7 (AC-2, plan decision D3), M8 (AC-8) · `00-s1-architecture-and-bytes.md` §3

## Context

NFR-S-02 publishes `@fhirq/element` ≤ 24 kB gzipped, standalone, "incl. core, view and default theme". NFR-S-03 publishes the script-tag IIFE ≤ 30 kB. Both are marked `ASSUMPTION`. ADR-0021 ranked what happens if the element does not fit:
- rung 1, the resume entry point, built in M3;
- rung 2, table-driven patchers, which fired on the M5 reading and M7 built;
- rung 3, amending the element's and the IIFE's figures by ADR, to the measured M7 figure plus the headroom that ADR argues for.

Not embedding the theme is not a rung in v1.

**What is measured.** A production build (M7 plan D9), gzip level 9, 1 kB = 1,000 bytes, read on 2026-09-25 after steps 3 to 9. It is the same as step 9's reading, since step 9 changed no source.

| | Minified | Gzipped | Figure today |
|---|---:|---:|---:|
| `@fhirq/element` | 78.39 kB | **27.28 kB** | 24 kB, over by 3.28 kB |
| `@fhirq/element (IIFE)` | 78.82 kB | **27.48 kB** | 30 kB, 2.52 kB under |

By layer, in minified bytes of output:
- core: 41,712;
- view: 18,390;
- the element's own modules: 14,906. The IIFE adds `iife.ts`, 45 bytes;
- the embedded theme: 3,289.

**How it grew.** The element was read in every PR from step 3 on (plan §6):

| After step | Element | IIFE |
|---|---:|---:|
| M1's spike renderer, the full view (M5) | 23.60 kB | 23.80 kB |
| 3b: the patcher and the entry kinds | 24.65 kB | 24.63 kB |
| 4: the option and read-only kinds | 25.47 kB | 25.42 kB |
| 5: inputs, lifecycle and events | 26.72 kB | 26.92 kB |
| 6: the default resolver | 27.03 kB | 27.24 kB |
| 7: tier 3 | 27.28 kB | 27.48 kB |

About 0.54 kB of step 5 is core's emission, which the element pulls in to put the response in its events (AC-09.1.2).

**The renderer came in under S1's estimate.** The two gated entries the element contains read 14.68 kB (core) and 7.36 kB (the view, less the kernel it shares with core). What remains is 5.24 kB, for the renderer, its wiring and the theme. Gzip is not additive, so this is approximate. With the theme taken out (below), the renderer is about 4.4 kB, against S1's element-renderer centre of 5.9 kB (band 3.6–8.6 kB). Rung 2 did what it was built for. The element is over its figure because core and view are, each already amended by ADR-0022 and ADR-0023, and because both are paid in full inside the element.

**The theme is not finished.** The element embeds M1's theme slice: `base.css` 0.65 kB and `default.css` 0.34 kB, gzipped standalone, 0.99 kB together. M8 completes `base.css` against the DOM contract, with `forced-colors`, reduced motion and print, and the element embeds whatever M8 builds (ADR-0014). S1's full-theme band is 9.5–16.0 kB minified, with a centre of about **4.2 kB** gzipped. Measured inside the element, the slice costs **0.88 kB**: the element with both sheets emptied is 26.40 kB against 27.28 kB. That is 0.11 kB less than the slice gzipped on its own.

**What else can still reach the element.** Every byte core or the view may still spend is a byte in the element:
- core's margin: 0.32 kB left of ADR-0022's 0.40;
- the view's margin: 0.43 kB left of ADR-0023's 0.44;
- the element's own fixes;
- M8 findings that need behaviour: step 8 raised two, the inheritance that crosses the shadow boundary and tokens set on an ancestor;
- conformance findings in M10, which land in core and the view under their own margins.

**The constraint that makes this hard.** The element's figure covers three things at once (ADR-0021): the whole engine it reaches, the whole view, and a stylesheet embedded as strings. The embed is how ADR-0014 meets both one-script-tag installation (AC-09.1.1) and `style-src 'self'` (NFR-C-07). Two of those three are already set from measured readings. The third, the theme, is the one layer whose scope is not built yet. It is built in the next milestone, inside this figure.

## Options considered

**A. Keep 24 kB and cut scope.** Rejected.
- **The gap.** It is 3.28 kB today, and about 6.5 kB once M8's theme is in, at S1's centre.
- **Where it would come from.** The element's own modules are 14.9 kB minified, about 5.2 kB gzipped at the element's ratio of 0.35. Deleting the renderer outright would not cover the gap once the theme is in.
- **What is left to cut is core, the view or the theme.** Core and the view hold only `Must`s, and each was kept whole by its own ADR, with R3 declining the cut ladder in writing. Cutting the theme is option B.

**B. Stop embedding the theme** (ADR-0021's option B). Rejected.
- **It is not a rung** (ADR-0021). It re-opens ADR-0014's option C: the embedder hosts a second file, AC-09.1.1's single script tag fails, and a CDN-hosted sheet fails `style-src 'self'` (NFR-C-07).
- **It does not reach 24 kB anyway.** With no theme at all the element reads 26.40 kB today, and about 27.6 kB with decision 3's margin.

**C. The measured figure plus a margin for fixes only, amended again at M8 if the theme overruns** (M7 plan D3, option b). Rejected.
- M8 grows the theme by an amount S1 already estimated. A figure that ignores that estimate is known today to be short, which makes a second amendment at M8 a planned event and not a finding.
- It is the "raised a little at each milestone" pattern that ADR-0022 and ADR-0023 were each written to avoid.

**D. Gate the element at M7 without the theme, and add it at M8** (M7 plan D3, option c). Rejected. NFR-S-02 defines the element's figure as including the default theme. Gating a different quantity under the same name publishes a number that describes no file a host downloads.

**E. Keep compacting the element's own modules until the reading holds.** Rejected.
- Rung 2 has been built: `kinds.ts` is one descriptor table over one keyed patcher.
- The largest module left is that table (7.7 kB minified). What remains in it is one entry per control kind, each tied to a DOM-contract row (`08-dom-contract.md`).
- As ADR-0022 found for core, the compaction curve is steep. A figure held that way is only deferred until the next fix.

**F. Amend the element's and the IIFE's figures once, at M7, to the measured reading plus an allowance for M8's theme plus a stated margin** (ADR-0021 rung 3; M7 plan D3, option a). Chosen.

## Decision

**1. `@fhirq/element` ≤ 31.7 kB gzipped** (31,700 bytes), standalone, a production build, including core, the view and the embedded default theme, measured as `scripts/measure-bundles.mjs` measures it today. It replaces 24 kB in NFR-S-02. It is no longer an `ASSUMPTION`. It is built up as:

| Part | kB | Why |
|---|---:|---|
| The M7 reading | 27.28 | Measured, 2026-09-25 |
| The theme allowance | 3.21 | S1's full-theme centre, 4.2 kB, less the measured slice, 0.99 kB, both gzipped standalone |
| The margin | 1.21 | See decision 3 |
| **Figure** | **31.70** | |

**2. The script-tag IIFE ≤ 31.9 kB gzipped** (31,900 bytes), a production build from `packages/element/src/iife.ts`. It replaces 30 kB in NFR-S-03, built up the same way: 27.48 + 3.21 + 1.21. The IIFE is the element plus its auto-definition and `window.fhirq.createSession`, 0.20 kB. It carries nothing else, so its figure moves with the element's. Keeping 30 kB would make the IIFE's gate, not the element's, the one that binds, at about 1.7 kB less than decision 1 allows.

**3. The margin is 1.21 kB gzipped,** sized for what can still reach the element after M8's theme:
- **0.75 kB is room that core (0.32) and the view (0.43) still hold under their own figures.** Without it, a change within ADR-0022's or ADR-0023's margin could fail the element's gate, and those figures would be smaller in practice than they are on paper. Inside the element these bytes compress alongside the rest, so this part is a ceiling.
- **0.46 kB is the element's own:** fixes, and M8 findings that need behaviour in the renderer. It is the size of the margins ADR-0022 and ADR-0023 set (0.40, 0.44), rounded up to the next 0.1 kB of the figure.

It is not sized for a new element feature, a second embedded preset or form participation (AT5). Each of those lands with its own reading, and with an ADR if it does not fit.

**4. The theme allowance is for M8's theme, and M8 re-reads it under this figure.**
- It is kept at D3's standalone arithmetic rather than the 0.89 ratio measured above: that ratio comes from one reading of a 3.3 kB slice. Read that way, the allowance holds about 0.35 kB of slack.
- If M8's theme needs more than the figure leaves, M8 finds the bytes in the theme or brings an ADR. It does not spend the margin in decision 3 without saying so in its close-out.

**5. Both entries are gated from this ADR.** `scripts/budgets.json` sets `@fhirq/element` to 31,700 and `@fhirq/element (IIFE)` to 31,900 and adds both to `gated`. `pnpm measure --check` fails on either, in the required `Engine gates` job.

**6. Nothing else moves.**
- Core stays at 15 kB, the view at 8.2 kB, resume at 4 kB and React at 6 kB.
- `base.css` stays ≤ 4 kB and each preset ≤ 3 kB, gated at M8 (M8 AC-8).
- The theme stays embedded (ADR-0014).
- ADR-0021's ladder is spent. A later overrun has no rung left, and needs an ADR of its own.

## Consequences

**Benefits**
- **The embed stays whole.** One script tag, `style-src 'self'`, and a styled first paint (AC-09.1.1, NFR-C-07, ADR-0014), which a script-tag embedder checks on day one and cannot work around.
- **The published figure is a measurement plus named allowances.** An adopter reading "31.7 kB" reads what the finished element weighs, what M8's theme is allowed, and what the margin is for. That figure is not a projection its first reading passed by 14 %.
- **It is raised once, before M8, not once at M7 and again at M8.** The theme's growth was estimated at S1 and is paid for here, in the open.
- **Upstream figures stay real.** Core and the view can spend their stated margins without the element's gate turning red for a reason nobody traced.

**Costs accepted**
- **A published figure goes up by 32 %,** 24 to 31.7 kB. The IIFE's goes up by 6 %, 30 to 31.9 kB. That is the cost `03-nfr.md` §2's `ASSUMPTION` note warned of, paid with a measured reason. The element's number is the kit's own competitiveness figure, not a requirement (ADR-0021). The position in Brief §4 is zero dependencies, no storage and no platform, and none of that moves.
- **The element's figure, not the theme's budgets, binds M8's theme.** `base.css` ≤ 4 kB and a preset ≤ 3 kB allow up to 7 kB of standalone theme. This figure allows about 4.2 kB. M8 has to size `base.css` against the element, not against its own row.
- **The allowance is S1's centre, not its top edge.** S1's band reaches about 5.1 kB (`00-s1-architecture-and-bytes.md` §3.6). If M8's theme lands at the top of that band, decision 4 applies, and the choice falls to M8 under the pressure this ADR was meant to remove.
- **The margin counts upstream room at face value.** 0.75 of the 1.21 kB is headroom that may never be spent. The alternative was an element gate that core's and the view's ADRs could fail from outside.
- **A third budget raised from a reading, in three milestones.** ADR-0022 and ADR-0023 guarded against habit by raising only figures whose scope was built. This ADR raises a figure one layer before its scope is built, the theme, and leans on S1's estimate for that layer. That is the exception rung 3 was written for. Decision 6's "no rung left" is what closes the path.
- **The IIFE's own headroom is gone.** NFR-S-03's 30 kB was set 6 kB above the element's figure, before the IIFE was known to be the element plus 0.2 kB. It now moves with the element, so a script-tag-only addition has nowhere to go without an ADR.

**Verification**
- **Budget gate:** `pnpm measure --check` fails when `@fhirq/element` is over 31,700 bytes or `@fhirq/element (IIFE)` over 31,900 bytes gzipped (`scripts/budgets.json`, `gated`). It runs in the required `Engine gates` job. The resume-path inputs check already covers both (ADR-0021).
- **The gated list is held by a test:** `scripts/test/measure-bundles.test.js` asserts `gated` equals the six entries, core to the IIFE, and that each has a figure.
- **The reading is recorded:** `03-nfr.md` §2 carries the M7 reading (27.28 and 27.48 kB), the measured slice inside the element (0.88 kB) and the build-up in decision 1. NFR-S-02's and NFR-S-03's rows, §11 N3 and `05-architecture.md` §6.1's IIFE row name the new figures, citing this ADR (M7 close-out).
- **The allowance is checked where it is spent:** M8's close-out reads the element under this figure in `03-nfr.md` §2, with the theme's part of it, as the M6 and M7 close-outs read the view's margin.

**Follow-ups**
- **The theme allowance** is closed by M8's reading of the element with the finished `base.css`. If it holds, the figure stands. If it does not, decision 4 applies.
- **The margin** is read at every close-out that touches core, the view or the element, and is closed by M11's release reading.
