# `fixtures/`

Conformance fixture pairs: one `Questionnaire`, one expected
`QuestionnaireResponse`, plus whatever the behaviour under test needs
(a command script, an expected diagnostic list, a snapshot).

**Empty at M0 by design.** The repository instructions require a fixture pair,
a conformance test and a conformance-matrix row for every spec behaviour, and
M0 implements no spec behaviour. The first pairs arrive with M2 (definition and
evaluation) and the matrix rows are enforced from M10
(`06-roadmap.md` §5, NFR-Q-04, AC-13.4.2).

## Rules for what lands here

- **One directory per behaviour**, named for the behaviour rather than the
  acceptance criterion, with the criterion and the FHIR R4 citation in a
  `README.md` beside the pair.
- **R4 (4.0.1) JSON only.** Version-neutral domain input belongs in engine unit
  tests, which ADR-0016 permits to build it directly; a fixture is what proves
  the codec seam, so a fixture is always R4 JSON.
- **Never hand-edited once copied from the HL7 specification.** A fixture
  derived from a spec example keeps its provenance in the neighbouring
  `README.md`. Where the kit needs a variation, it is a new authored fixture,
  not an edit of the spec's.
- **No answer values in expected diagnostics** (NFR-X-04). A fixture that
  asserts a diagnostic asserts its code and path.
- **Benchmark fixtures are separate** and carry their committed baseline; see
  `00-s0-instrument-survey.md` §4 for the sizes they are anchored to.

## Benchmark fixtures (`bench/`)

Generated, never hand-edited: `node scripts/gen-bench-fixtures.mjs` writes them
from a fixed seed, and `--check` fails if a committed file differs.

| File | Shape | Measures |
|---|---|---|
| `small-25.json` | 25 items, S0's median instrument | NFR-P-01 and P-02, with absolute budgets |
| `large-500.json` | 500 items, S0's p90 | NFR-P-01 and P-02, held against the baseline |
| `ceiling.json` | **Synthetic stress case**, not a real instrument: 1,000 items, 500 conditions, a repeating group of 20 items taken to 50 instances, nesting 10 | NFR-P-08 retained heap; the NFR-P-09 recompute-set test; reference timings that are reported, not gated |

`pnpm bench` takes the median of five runs into `reports/bench/results.json`;
`pnpm bench:compare` fails above 20 % of `benchmarks/baseline.json`. The
baseline is measured on the CI runner and changes only through an explicit PR
(`06-roadmap.md` M2 D7): download the `bench` artifact from a green run and
write it with `node scripts/bench-compare.mjs <results.json> --update`.
