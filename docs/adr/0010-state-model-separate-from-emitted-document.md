# ADR-0010 — Engine state, emitted response and snapshot are separate models

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** US-05.1, US-05.3 (AC-05.3.1–3), US-06.1 (AC-06.1.1–5), AC-05.2.2 · NFR-Q-06, NFR-X-04 · INV-E-01–11, `04-domain.md` §3.4, §8, §9.3 properties 1, 2 and 5 · `05-architecture.md` §4.1, §8 A5 · NFR-M-05 topic *state model vs emitted document*

## Context

The product decision on retention (ADR-0011) means the engine must hold data the clinical record must never contain: answers to items that are currently hidden. The requirements spell out the consequences:

- The emitted `QuestionnaireResponse` contains enabled, answered items only, and no field of it is derived from disabled-item state (AC-05.3.2).
- A snapshot reproduces the session exactly, retained answers included (AC-05.3.1), and cannot be restored against a different questionnaire (AC-05.3.3).
- Emitting, hydrating and emitting again gives the same content (INV-E-06, checked by 1,000 generated cases per run, NFR-Q-06).
- Hydrating and restoring are different paths with different fidelity (`04-domain.md` §3.4).

US-05.3 exists so that an adopting team can verify the two models are really distinct. The architecture has to make that separation structural, so that one careless line of code cannot undo it.

## Options considered

**A. The engine state *is* a `QuestionnaireResponse`,** mutated in place, with retained answers stored as an extension on hidden items. Rejected. Emission would have to strip extensions, so a missed strip leaks hidden answers into the clinical record, the exact failure retention exists to prevent. The FHIR shape has no repeat ordinals (only array positions, which T11 rules out as identity) and nowhere to put surfacing state. Engine logic would read FHIR structures everywhere, which ADR-0016 forbids.

**B. A `QuestionnaireResponse` for visible data, plus a side table for retained answers and engine-only state.** Rejected. Every command would have to keep two stores consistent: moving an answer between the response and the side table whenever enablement flips. That is two sources of truth, and the domain's retention machine (SM-02) would be spread across both.

**C. The snapshot *is* the engine state, and emission filters it.** Close to the chosen option. Rejected in the form where one serialiser has a "visible only" flag: a single code path with a filter parameter is exactly the "derived from disabled-item state" coupling AC-05.3.2 forbids, and a flag default is one typo away from leaking.

**D. Engine-native stored state; two one-way outputs on distinct code paths, one of which can only see the visible projection.** Chosen.

## Decision

**Stored state** (private to `session/`) is exactly the five structures in `04-domain.md` §9.3 property 1:
1. answers by item path, including retained answers;
2. repeat instances per group node, with ordinal and position;
3. surfacing state per node;
4. lifecycle status;
5. host identity.

Session configuration (retention policy, load mode, surfacing mode) and the Definition canonical are fixed at creation. Everything else is derived.

**The visible projection** (`session/projection`) is a read-only interface over settled state. It exposes only effectively enabled nodes and their answers, in document order with repeat instances in position order. Validation, rules, scorers, the evaluator, the presentation model and **emission** reach answers only through it.

**Emission** (`interchange/emit`) builds a `QuestionnaireResponse` from the visible projection, host identity, lifecycle status and an `authored` timestamp supplied by the caller or taken from the clock at the call (INV-E-01–05). The module has no import path to session internals, so it cannot read a retained answer even by mistake. Emitted responses are cached per session version, so repeated calls between changes return the same object.

**Snapshot** (`session/snapshot`) serialises the stored state plus configuration to plain JSON:

```jsonc
{
  "format": "fhirq-snapshot/1",
  "definition": { "url": "…", "version": "…" },
  "config": { "retention": "retain-exclude", "surfacing": "blur-then-live", "loadMode": "strict" },
  "status": "in-progress",
  "hostIdentity": { /* verbatim or absent */ },
  "groups": { "<groupPath>": { "nextOrdinal": 3, "instances": [ /* ordinals in position order */ ] } },
  "answers": { "<itemPath>": [ /* typed answers */ ] },
  "surfacing": { "<itemPath>": "live" }
}
```

Option lists (ADR-0005) and derived values (enablement, calculated values, scores, validation) are deliberately absent.

**Two entry paths back in, never merged.**
- **Hydrate** (`interchange/hydrate`) runs the full `04-domain.md` §8 policy: drift, orphans, quarantine, disabled-answer drop.
- **Restore** (`session/snapshot`) checks `format` and the definition canonical, then loads the state as it was saved. It refuses a different canonical (AC-05.3.3) and refuses a format major it does not know.

**Snapshot format versioning.** `fhirq-snapshot/<major>`. Restore accepts only the major it writes. A change to the snapshot format is a semver-major change of `@fhirq/core`, recorded in the changelog. Snapshots are not a migration format across questionnaires (AC-05.3.3), and they are not one across incompatible engine versions either.

## Consequences

**Benefits**
- **The clinical record cannot contain a hidden answer through a code defect in emission,** because emission has no code path to hidden answers. That is a stronger claim than "we filter correctly", and an integrator's security review can check it by reading one import list.
- **The two outputs can be shown side by side** in the playground (AC-12.2.1) as literally different JSON, which makes the design visible to EVL without reading code.
- **Round-trip testing is well-defined:** `emit ∘ hydrate ∘ emit` exercises only the FHIR path; `restore ∘ snapshot` exercises only the engine path.

**Costs accepted**
- **Two serialisation formats to maintain.** The snapshot is a second schema the kit owns, with its own versioning obligation.
- **A snapshot contains data that is not in the clinical record.** A host storing snapshots is storing hidden answers, which matters for data minimisation. The docs must say so where snapshots are introduced, and point to `discard` for hosts that cannot accept it (ADR-0011).
- **Snapshots do not survive a snapshot-format major upgrade.** A host that upgrades across one must resume in-flight sessions from emitted responses instead, losing retained answers. This is stated in the upgrade notes when it happens.
- **Hydrate can never restore retained answers** (`04-domain.md` §3.4). A host wanting mis-click protection across page reloads must persist the snapshot.

**Verification**
- Lint (`no-restricted-imports`): `interchange/**` may import from `session/projection` and `session/snapshot` types only, never other `session/**` modules; `validation/**`, `ports/**` and `view/**` may import `session/projection` only.
- Property test (NFR-Q-06): for ≥ 1,000 generated sessions, `emit(hydrate(emit(s)))` equals `emit(s)` ignoring `authored` and `status`.
- Property test: for generated sessions including retained answers, `restore(snapshot(s))` produces a session whose snapshot is deep-equal to the original, and whose emitted response is equal to the original's (INV-E-07).
- Leak test: generate sessions where every disabled node holds a sentinel answer value, emit, and assert that no sentinel appears anywhere in the serialised response.
- Restore tests: a different canonical and an unknown format major are each refused with a typed error naming both values.
