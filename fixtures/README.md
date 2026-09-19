# `fixtures/`

Conformance fixtures: one `Questionnaire` per behaviour, plus what the
behaviour under test needs: a command script, expected diagnostics and issues,
and from M3 stored and expected `QuestionnaireResponse`s.

**From M2** each behaviour directory holds `questionnaire.json` and
`scenario.json`. **From M3** it may also hold R4 `QuestionnaireResponse`s: one a
case hydrates from (`response.json` and the like), and one a case must emit at
its end (`expected-response.json` and the like). A scenario names each file it
uses, and a directory holds no response file that no case names. Each case is
linked from a row of `docs/conformance/matrix.json`. M10 renders the matrix and
enforces every link against a passing run (NFR-Q-04, AC-13.4.2).

## The scenario (`scenario.json`)

`packages/core/test/conformance/fixtures.test.ts` loads the questionnaire through
the public `createSession`, as a host would, and replays each case as the test
`<directory>: <case name>`.

```jsonc
{
  "behaviour": "One line, with the criteria and invariants it proves",
  "cases": [
    {
      "name": "strict rejects",
      "loadMode": "strict",                 // or "lenient"
      "retention": "discard",               // optional; the default is retain-exclude
      "hostIdentity": { "subject": { "reference": "Patient/1" } },  // optional, as SessionOptions takes it
      "hydrate": "response.json",           // optional: resume from this stored response instead of starting empty
      // Either the load is rejected, with these findings in this order…
      "rejected": [{ "code": "dependency-cycle", "path": "a", "related": ["a", "b"] }],
      // …or it loads, with these diagnostics and these enabled node paths, in document order.
      "diagnostics": [{ "code": "dangling-condition", "path": "q" }],
      "enabled": ["q", "group/child"],
      // Commands, each with its result and the enabled paths after it.
      "steps": [
        {
          "name": "answer the question",
          "command": { "type": "SetAnswer", "path": "q", "answers": [{ "kind": "boolean", "value": true }] },
          "result": { "outcome": "applied" },
          "enabled": ["q", "dependent"]
        }
      ],
      // Optional: the answers on some node paths at the end.
      "answers": { "q": [{ "kind": "boolean", "value": true }] },
      // Optional: the validation result at the end, in order, on the fields each names.
      "issues": [{ "code": "max-length", "path": "q", "params": { "limit": 5 } }],
      // Optional: the response the session emits at the end, with `authored` fixed at 2026-01-01T00:00:00Z.
      "response": "expected-response.json",
      // From M4, optional: the host's collaborators, as in-memory doubles (below).
      "resolver": { "urn:example:ValueSet/route": { "resolve": [{ "system": "urn:example:codes", "code": "a" }] } },
      "scorers": { "total": { "inputs": ["first", "second"], "sum": ["first", "second"] } },
      "evaluator": { "total": { "kind": "integer", "sum": ["a", "b"] } },
      // Optional: each option set's status and each score at the end.
      "optionSets": { "urn:example:ValueSet/route": "resolved" },
      "scores": { "total": 3 }
    }
  ]
}
```

**Collaborator doubles (from M4).** A fixture cannot hold code, so the runner
builds each collaborator a case names, in memory:

- `resolver`, by value set canonical: `{ "resolve": [codings] }` fulfils with
  them, `"reject"` rejects, and `"pending"` (or a canonical not named) never
  settles. Resolutions started at creation settle before the first step; a step
  with `"settle": true` lets the ones its command started (`RetryOptions`)
  settle before its `enabled` is checked.
- `scorers`, by name: `inputs` as the scorer declares them, and either `sum`,
  which adds the first answer of each named item that is visible and is `null`
  until every one is there, or `"throws": true`.
- `evaluator`, by calculated item `linkId`: the same `sum`, returned as an
  answer of `kind`, or nothing until every input is there. The expression text
  in the questionnaire is never read: the kit has no FHIRPath (ADR-0017).

A finding or diagnostic is compared on the fields it names: `code` and `path`
always, `related`, `detail`, `severity`, `expected` and `found` where given.
`detail` holds an item type, a value type or an extension URL; `expected` and
`found` hold answer kinds, canonicals or counts. Never an answer. An expected
response is compared whole: it holds answers, which is what a response is for.

**Generated fixtures.** The `enablewhen-<type>` directories are written by
`scripts/gen-conformance-fixtures.mjs` from a truth table, not by the engine; a
test fails if a committed file differs from what it writes. Change the script,
not the files.

**`demo/`** is the demo questionnaire, not a behaviour fixture: it has no
scenario, and `packages/core/test/conformance/demo.test.ts` checks its
structure.

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

`pnpm bench` takes the median of five runs into `reports/bench/results.json`.
With `--against <checkout>` it benchmarks another checkout in the same job,
runs alternating, into `reports/bench/reference.json`; CI passes the merge
base. `pnpm bench:compare` fails when a timing is more than 20 % over the
reference run, when retained heap is more than 20 % over
`benchmarks/baseline.json`, or when a 25-item absolute budget is broken.
Timings are never compared with the committed file: hosted runners differ by
up to 2× between jobs (`06-roadmap.md` M2 D7). The committed figures are
published reference figures and change only through an explicit PR: download
the `bench` artifact from a green run on `main` and write it with
`node scripts/bench-compare.mjs --results <results.json> --update`.
