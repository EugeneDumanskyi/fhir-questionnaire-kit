# ADR-0001 — The questionnaire is fixed for the life of a session

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** AC-01.1.4, AC-12.3.1, AC-12.4.1, US-06.1, US-06.3 · INV-D-12 · `04-domain.md` §9.1 D1

## Context

A session is built from a questionnaire in one step. Every structural check happens at that moment (unique `linkId`s, supported types, no cycles, resolvable references, depth limits), and the dependency graph is derived from the result. Everything the session holds afterwards is keyed to that structure: answers sit at item paths, repeat ordinals number instances of specific groups, and each answer's type is checked against its item's type.

A host sometimes has a different questionnaire to show while a session is open. In the playground, a pasted questionnaire is edited live (AC-12.3.1). In production, a questionnaire may be republished while a respondent is part-way through, and the brief requires that a questionnaire change never needs an engineering release.

The requirements already define one way to carry answers from one questionnaire to another: emit a response and resume from it, with diagnostics for drift, orphans and type changes (US-06.1, US-06.3). The question is whether there should be a second way.

## Decision

The questionnaire a session was created from never changes during that session. The engine has no operation that replaces or patches it. To show a different questionnaire, the host creates a new session. To keep answers across the change, the host emits a response from the old session and resumes from it into the new one.

Switching customization tier or theme (AC-12.4.1) does not touch the session at all, so it is unaffected.

## Alternatives considered

**A. Swap the questionnaire in place and migrate answers by `linkId`.** Rejected. It creates a second migration path next to resume, with its own rules for type changes, removed items and repeat instances, which would need its own tests and its own conformance story. Every session invariant would have to hold not only after each command but also across a change of definition, and the dependency graph, repeat ordinals and error display state would all need invalidating. Resume already answers the question "what survives a questionnaire change?", and it is the path covered by round-trip property tests (NFR-Q-06).

**B. Allow incremental edits (add, remove or change an item).** Rejected. That is authoring, which the brief excludes ("render, don't author"). It would also make structural checks run at arbitrary times instead of once at load, so a session that was valid could become invalid in the middle of a fill.

**C. Swap in place and discard all answers.** Rejected. It behaves exactly like creating a new session, but hides that behind an operation whose name suggests continuity. An integrator would reasonably expect answers to survive, and would be wrong.

## Consequences

**Benefits**
- Structural checks run exactly once. Nothing checked at load can become false later, which is what lets the engine rely on the dependency graph without re-checking it (INV-D-12).
- There is one definition of "what survives a questionnaire change": resume, with its diagnostics. It is tested once and documented once.
- Version drift is always visible, because the only way across a change goes through the path that reports drift (AC-06.3.1).

**Costs accepted**
- **Retained answers are lost across a swap.** An emitted response leaves out answers to hidden items, and a snapshot cannot be restored against a different questionnaire (AC-05.3.3). A respondent who hid an answer and then saw the questionnaire republished cannot get that answer back. This is accepted: an answer that was hidden when the questionnaire changed has no defensible meaning under the new version.
- **Error display state resets across a swap.** Errors the respondent had already been shown go quiet in the new session until they are triggered again.
- **The playground rebuilds a session on each accepted edit.** That cost is bounded by NFR-P-01 (≤ 50 ms for 200 items). How often edits are accepted (for example, only once the pasted JSON parses) is a presentation concern.

## Verification

- The public API report (NFR-M-04) contains no operation that takes a questionnaire and an existing session, apart from resume and restore, which create a new session.
- A playground test edits the pasted questionnaire and asserts that answers to unchanged items carry over and that drift diagnostics appear. That proves the playground goes through resume rather than a private path.
