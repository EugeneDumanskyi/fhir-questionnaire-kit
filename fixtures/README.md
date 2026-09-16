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
