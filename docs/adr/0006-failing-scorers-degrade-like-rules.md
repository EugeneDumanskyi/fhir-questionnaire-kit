# ADR-0006 — A failing scoring function degrades like a failing rule

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** US-07.2 (AC-07.2.1–4), AC-04.3.2, AC-07.3.4, NFR-X-04 · INV-V-05, INV-X-05, INV-X-09 · `04-domain.md` §9.1 D6

## Context

The engine calls host code in the middle of an evaluation cycle, through two synchronous ports:

- **Cross-field rules.** The requirements say what happens when one throws: it is caught, reported as a diagnostic, and form interaction continues (AC-04.3.2).
- **Scoring functions,** such as a PHQ-9 total (US-07.2). The requirements were silent on failure until AC-07.2.4.

Scoring functions will throw in practice. A common case is a scorer written against a flat instrument and reused inside a form with conditional sections: it expects all nine answers, but AC-07.2.2 correctly leaves out answers to hidden items, so it reads a missing value and throws.

The engine exposes a score's value without interpreting it (INV-X-05). It has no idea whether a score matters clinically, so it cannot decide that a missing score should block anything.

## Decision

When a scoring function throws, the engine:

1. **catches the error** and completes the evaluation cycle normally;
2. **clears that scorer's result.** No score is shown, and the last successful value is *not* kept;
3. **raises a diagnostic** naming the scorer and the kind of failure, but not the thrown message text, which is host-authored and may contain answer values (NFR-X-04). The original error object is given to the host in memory, as it is for resolver failures (AC-07.1.2), and is never copied into diagnostic text;
4. **leaves other scorers, rules and completion unaffected.**

This is the same handling as for cross-field rules, so the engine has one failure model for host code called during a cycle.

## Alternatives considered

**A. Let the exception reach whoever issued the command.** Rejected. A bug in scoring code would stop the respondent from answering questions, and could crash the host's form part-way through a fill. The person who pays for the host's bug would be the patient.

**B. Keep the last successful score.** Rejected on patient-safety grounds. A PHQ-9 total that no longer matches the answers on screen, shown as if current, is worse than no total. A clinician reading it has no way to tell it is stale.

**C. Show the failure to the respondent as an error.** Rejected. The respondent cannot fix host code, and an error they cannot act on reads as the form being broken. Presentation may show a neutral "score unavailable" message from the catalogue, but it is not a validation issue.

**D. Block completion while a scorer is failing.** Rejected. That would have the engine decide a score is clinically required, which is the clinical interpretation INV-X-05 forbids. A host that needs a valid score before accepting a response can check diagnostics before calling completion. The policy stays with the party that knows what the score means.

## Consequences

**Benefits**
- One failure model for rules and scorers, documented and tested once.
- A host bug can never cost the respondent their work or their ability to continue.
- A score shown on screen always matches the answers on screen.

**Costs accepted**
- **Failures are quiet by default.** A host that does not watch diagnostics can ship a broken scorer without noticing. The docs will recommend that integrators' tests fail on any diagnostic raised while running their fixtures, and the PHQ-9 and GAD-7 examples (AC-07.2.3) will do this.
- **A response can be completed with no score.** Whether that is acceptable is the host's decision.
- **Less detail in diagnostics.** Dropping the thrown message from diagnostic text makes debugging from logs harder. Accepted: whatever answer values a host's own error message contains must not reach a log through the library.

## Verification

- A test registers a scorer that throws on a missing answer and hides one contributing item. It asserts: the cycle completes, the score is cleared rather than stale, one diagnostic is raised, and other scorers still produce results.
- A test registers a scorer that throws an error whose message contains a known answer value. It asserts that value appears in no diagnostic text and nothing is written to the console (NFR-X-04).

## Follow-ups

**Accepted on 2026-09-15 as AC-07.3.4.** The expression evaluator (ADR-0003) is also host code called synchronously during a cycle, and the requirements only cover the case where no evaluator is supplied. The same failure model applies to it: the calculated value is cleared, a diagnostic is raised without the thrown message text, and the cycle continues.
