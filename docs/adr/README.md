# Architecture Decision Records

Each ADR states context, decision, alternatives with rejection reasons, and consequences including costs accepted (AC-13.3.1). Every claim must be arguable from first principles by the maintainer, unaided (AC-13.3.2).

Numbers are assigned in order of writing and never reused. A superseded ADR stays in place with its status changed and a link to its replacement.

## Index

| ADR | Title | Status | Origin |
|---|---|---|---|
| [0001](0001-questionnaire-fixed-per-session.md) | The questionnaire is fixed for the life of a session | Accepted | `04-domain.md` D1 |
| [0002](0002-refuse-commands-on-disabled-items.md) | Commands against disabled items are refused | Accepted | `04-domain.md` D2 |
| [0003](0003-calculated-items-are-read-only.md) | Calculated items are read-only | Accepted | `04-domain.md` D3 |
| [0004](0004-validation-timing-and-ownership.md) | Validation timing and ownership | Accepted | `04-domain.md` D4; NFR-M-05 |
| [0005](0005-eager-option-resolution.md) | Options are resolved at session start and not snapshotted | Accepted | `04-domain.md` D5 |
| [0006](0006-failing-scorers-degrade-like-rules.md) | A failing scoring function degrades like a failing rule | Accepted | `04-domain.md` D6 |
| [0007](0007-layered-architecture-with-shared-presentation-model.md) | Layered architecture: headless core, shared presentation model, thin native renderers | Accepted | `05-architecture.md` §2–4 |
| [0008](0008-zero-runtime-dependencies.md) | Zero third-party runtime dependencies, enforced mechanically | Accepted 2026-09-16 | `05-architecture.md` §4; NFR-S-01 |
| [0009](0009-incremental-evaluation-over-compiled-graph.md) | Incremental evaluation over a dependency graph compiled at load | Accepted 2026-09-16 | `05-architecture.md` §4; NFR-P-09 |
| [0010](0010-state-model-separate-from-emitted-document.md) | Engine state, emitted response and snapshot are separate models | Accepted 2026-09-16 | `05-architecture.md` §4; US-05.3 |
| [0011](0011-retain-hidden-answers-exclude-from-response.md) | Answers to hidden items are retained and excluded from the response by default | Accepted 2026-09-16 | Brief §5; AC-05.2.4 |
| [0012](0012-injected-option-resolver.md) | Option lists come from an injected resolver; only the element ships a default | Accepted 2026-09-16 | `05-architecture.md` §4; US-07.1 |
| [0013](0013-customization-tiers-as-layer-boundaries.md) | Four customization tiers, each stopping at a layer boundary | Accepted 2026-09-16 | `05-architecture.md` §4; E10 |
| [0014](0014-shadow-dom-with-constructable-stylesheets.md) | The element renders into shadow DOM styled by constructable stylesheets | Accepted 2026-09-16 | `05-architecture.md` §4; E09 |
| [0015](0015-react-adapter-session-ownership-and-ssr.md) | React adapter: sessions owned outside components, SSR by construction | Accepted 2026-09-16 | `05-architecture.md` §4, §9 AT2; E08 |
| [0016](0016-fhir-r4-only-behind-codec-seam.md) | FHIR R4 only, behind an internal codec seam | Accepted 2026-09-16 | Brief §5; NFR-C-09 |
| [0017](0017-fhirpath-excluded-evaluator-seam.md) | FHIRPath is excluded; expressions route through an evaluator seam | Accepted 2026-09-16 | Brief §5; US-07.3; `05-architecture.md` §9 AT3 |
| [0018](0018-build-and-verification-toolchain.md) | Build and verification toolchain under the licence allowlist | Accepted 2026-09-16 | `05-architecture.md` §9 AT1; E14 |
| [0019](0019-static-client-only-playground-and-docs.md) | Playground and docs are static, client-only and run under a strict CSP | Accepted 2026-09-16 | `05-architecture.md` §9 AT4; E12 |
| [0020](0020-explicit-locale-formatted-in-the-view-model.md) | Values are formatted in the view model from an explicit locale | Accepted 2026-09-16 | `03-nfr.md` §12 #9; NFR-I-04 |
| [0021](0021-resume-entry-point-and-staged-element-budget.md) | Resume code ships as its own core entry point, and the element budget is held by ranked, measured reductions | Accepted 2026-09-17 | `03-nfr.md` §2 tripwire; NFR-S-02 |

## NFR-M-05 coverage

NFR-M-05 requires at least ten ADRs at v1.0 covering the topics below. With the architecture phase written, every topic has an ADR; the count is twenty-one.

| Topic | ADR |
|---|---|
| Answer retention on hide | 0011 |
| Zero-dependency constraint | 0008 |
| Resolver injection | 0012 (timing in 0005) |
| Core / adapter / element layering | 0007 |
| State model vs emitted document | 0010 |
| Customization tier model | 0013 |
| FHIRPath exclusion and its seam | 0017 (read-only calculated items in 0003) |
| R4-only | 0016 |
| Validation timing and ownership | 0004 |
| Shadow DOM in the element | 0014 |

## Template

ADR-0001 to ADR-0006 use the layout below. From ADR-0007 on, ADRs put **Options considered** before **Decision**, and fold **Verification** into **Consequences**: Context / Options considered / Decision / Consequences. The content required by AC-13.3.1 is the same in both layouts.

```markdown
# ADR-NNNN — Title

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Traces to:** requirements, invariants, domain decisions

## Context
## Decision
## Alternatives considered
## Consequences
## Verification
## Follow-ups (optional)
```
