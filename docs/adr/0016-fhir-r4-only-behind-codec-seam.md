# ADR-0016 — FHIR R4 only, behind an internal codec seam

- **Status:** Proposed
- **Date:** 2026-09-15
- **Traces to:** Brief §5 (spec depth; R5 exclusion) · AC-01.1.3, US-05.1, US-06.1 · NFR-C-09, NFR-S-02, NFR-U-05 · INV-D-01, BC1, BC4 (anti-corruption layer), `04-domain.md` §2 relationship patterns · `05-architecture.md` §4.1 · NFR-M-05 topic *R4-only*

## Context

FHIR R4 (4.0.1) is where the deployed base of clinical systems is. R5 exists and changes the Questionnaire resource in ways a renderer notices: for example, `choice` and `open-choice` are replaced by a `coding` type whose `answerConstraint` says whether free text is allowed, and there is new vocabulary for how disabled items are displayed. A kit supporting both needs two parsers, two emitters and a conformance matrix per version.

The brief excludes R5 ("version abstraction documented, not implemented"), and NFR-C-09 publishes R4 only. The architecture question is **what "documented, not implemented" means in code:** whether the design leaves a real seam where R5 could attach, or only a paragraph claiming one could be added.

`04-domain.md` already treats FHIR as an external language. BC1 is conformist to R4, BC4 is an anti-corruption layer, and BC2 "never reads the raw Questionnaire".

## Options considered

**A. R4 types used throughout the engine.** Session, validation and presentation code work directly on R4 `Questionnaire.item` objects. Rejected. It is the quickest to write, but R5 support would mean touching every module, and the claim that an abstraction is "documented" would be false. It would also contradict the anti-corruption boundary in the domain model.

**B. Implement R4 and R5.** Rejected by scope (Brief §5). It doubles BC1 parsing and BC4 interchange, adds conformance rows and fixtures per version, and serves no principle in Brief §6 that R4 alone does not.

**C. A public, pluggable version adapter** (`createSession(q, { fhir: r4 })`). Rejected. It exports an interface with exactly one implementation (NFR-U-05 surface), invites third-party adapters whose conformance the kit cannot vouch for, and commits the kit to the interface's stability under semver before a second version has tested whether it is right.

**D. R4 only, with every FHIR-shaped type confined to one internal module behind version-neutral domain types.** Chosen.

## Decision

- **`fhir/r4/`** is the only module that defines or imports FHIR R4 resource shapes. It exports two internal functions:
  - `parseQuestionnaire(json) → DefinitionInput | LoadError`, which maps R4 item types, `enableWhen`, `enableBehavior`, extensions of interest and constraints into version-neutral `DefinitionInput`;
  - `encodeResponse(projection, meta) → R4 QuestionnaireResponse` and `decodeResponse(json) → StoredAnswers`, used by BC4.
- **`definition/`, `session/`, `validation/` and `view/`** use only domain types (`ItemType`, `Answer`, `Condition` …) from `kernel/`. The domain's `ItemType` includes `choice` and `open-choice` as *domain* concepts. An R5 codec would map `coding` plus `answerConstraint` onto them.
- **Public API types** for questionnaires and responses are the R4 shapes: that is what integrators hold. They are re-exported from `fhir/r4` under neutral names (`Questionnaire`, `QuestionnaireResponse`) and documented as R4.
- **Version detection.** `parseQuestionnaire` rejects a resource declaring a `fhirVersion` other than 4.0.x, and rejects a resource whose shape is recognisably R5 (for example an item `type` of `coding`) with an error naming the rule (INV-D-01).
- **The codec is not exported.** The seam is internal and documented in the architecture docs and in this ADR. It becomes public only when a second version is implemented, and then under its own ADR.

## Consequences

**Benefits**
- **"Version abstraction documented" is literally true and checkable:** one lint rule shows that FHIR types are confined to one directory.
- **The engine's tests are version-neutral.** Most engine tests build `DefinitionInput` directly, which is shorter and more readable than R4 JSON fixtures, and would carry over unchanged to R5.
- **No public interface is committed to** before a second implementation has tested it.

**Costs accepted**
- **An extra mapping layer** with its own tests and a few hundred bytes in core. Parsing R4 into domain types is work that option A would skip.
- **Domain types are shaped by R4 first.** Where R5 introduces a concept with no R4 counterpart (disabled-display behaviour, for example), the domain types would need extending. The seam reduces the cost of adding R5; it does not make it free.
- **R5 users are rejected, not degraded.** Even a trivially compatible R5 questionnaire fails to load. This is intended: partial R5 support would imply conformance the kit does not test.

**Verification**
- Lint (`no-restricted-imports`): only `fhir/r4/**` and the public type re-export may import from `fhir/r4`; nothing outside `fhir/**` may declare `resourceType`.
- Codec round-trip tests: `decodeResponse(encodeResponse(p))` preserves every answer type, including `Quantity` units and `open-choice` free text.
- Load tests: `fhirVersion: "5.0.0"` and an R5-shaped item are each rejected with an error naming the rule and the `linkId` path.
- The conformance matrix has an `R5` row marked `out of scope`, with this ADR linked as the reason.
