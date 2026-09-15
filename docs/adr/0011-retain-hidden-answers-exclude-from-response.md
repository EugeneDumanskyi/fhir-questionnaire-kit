# ADR-0011 — Answers to hidden items are retained and excluded from the response by default

- **Status:** Proposed
- **Date:** 2026-09-15
- **Traces to:** Brief §5 "key product decision", §6 principle 4 · US-05.2 (AC-05.2.1–6), AC-02.2.4, AC-06.1.5, AC-07.2.2 · INV-S-04, INV-S-12, INV-S-13, INV-E-01, INV-X-04, SM-02, `04-domain.md` §9.2 T4, T5, T7 · requirement R6 · NFR-M-05 topic *answer retention on hide*

## Context

A respondent answers question B. Later they change an earlier answer A, and B's `enableWhen` no longer holds, so B disappears. The FHIR R4 specification says what to *display*, but it leaves open what an implementation should *do* with the answer B already holds. Two parties care, and they want different things.

**The respondent** may have changed A by mistake: a mis-tap on a tablet, or a "no" they meant as "yes". If they change A back, they expect B's answer to still be there. A long clinical form that silently discards work on a mis-tap teaches the respondent to fear the controls, and some will re-enter B carelessly the second time.

**The clinical record's consumers** read the emitted `QuestionnaireResponse`: a clinician, a downstream scorer, an analytics pipeline. The response must record only what the respondent was actually asked. If B is a scored item and its answer stays in the response after B was hidden, a total can count a question the patient was never shown under the final branching. The recorded score is then wrong without any visible sign. Removing questions that do not apply is the whole purpose of `enableWhen`; a record that includes them anyway undoes it.

These two needs conflict only if engine state and the emitted document are the same thing. ADR-0010 makes them different things, which is what makes the chosen option possible.

The argument here is made from these first principles alone, as AC-05.2.4 requires.

## Options considered

**A. Discard on hide.** Erase B's answer as soon as B is disabled. Simple and data-minimal: nothing is held that is not in the record. Rejected as the *default*, because it turns every mis-tap on a gating question into lost work, for the whole dependent subtree at once. With a cascade depth of 5 (NFR-P-05), one wrong tap can erase a section. It is kept as the configurable alternative (AC-05.2.3).

**B. Retain and emit.** Keep B's answer and include it in the response. Rejected on patient-safety grounds, as described above: the record would contain answers to questions that did not apply, and downstream consumers cannot tell them apart from applicable ones. Emitting them with a "hidden" flag only moves the obligation to filter onto every consumer, and consumers that ignore the flag are the danger.

**C. Retain and exclude.** Keep B's answer in engine state, restore it if B is re-enabled, and leave it out of every downstream view: emission, validation, scoring, rules and other conditions. Chosen.

**D. Ask the respondent** ("Hiding this section will clear 6 answers — continue?"). Rejected as a domain policy. It interrupts on every gating change, including intentional ones, and it forces a modal flow on every tier, which the headless tier cannot guarantee. Presentation may still add confirmation for *removing a repeat instance*, which is permanent (AC-03.2.6).

**E. Per-item policy set by the questionnaire or host.** Rejected for v1 (R6). It needs a way to express the policy per item, and a questionnaire mixing policies has cascades whose outcome depends on which items discard. The domain model and tests would multiply for an unrequested need.

## Decision

- **Default policy: `retain-exclude`.** A disabled node keeps its answers; re-enabling shows them again (INV-S-12).
- **Alternative: `discard`,** chosen once per session at creation. Answers of a node that becomes disabled are erased in the same cycle, including all descendants of a disabled group, and a disabled repeating group resets to one empty instance (INV-S-13, AC-05.2.6).
- **Hidden means hidden to every consumer.** A retained answer does not appear in the emitted response (INV-E-01), the scoring projection (AC-07.2.2), cross-field rules (INV-V-03), or other items' conditions (INV-S-04, AC-02.2.4). The **only** reader is the snapshot (ADR-0010).
- **A retained answer cannot be edited while hidden** (ADR-0002). It can only be restored by re-enabling its item.
- **Removal is not hiding.** Removing a repeat instance destroys its answers under either policy (INV-S-25).
- **Hydration does not create retained answers.** A stored answer that lands on an item that evaluates disabled is dropped with a diagnostic (AC-06.1.5), so every retained answer was entered while its item was visible in this session.

## Consequences

**Benefits**
- **Mis-taps cost nothing.** Changing a gating answer back restores the dependent answers exactly as they were.
- **The record only contains what was asked** under the final branching, so downstream scoring and review need no knowledge of retention at all.
- **Conditions behave as if hidden answers do not exist** (INV-S-04), so a chain collapses correctly under retention, the same as under `discard`.
- **Every retained answer has known provenance:** entered by this respondent, in this session, while visible (ADR-0002, AC-06.1.5).

**Costs accepted**
- **The engine holds data that is not in the record.** Under data-minimisation rules, a host that persists snapshots is storing answers the clinical record does not contain. The docs state this beside the snapshot API and recommend `discard` for hosts that persist snapshots and cannot justify it.
- **Retention does not survive resume from a response.** Only snapshots carry retained answers, so mis-tap protection across a reload needs the host to store snapshots (ADR-0010).
- **A re-shown answer may now be wrong in context.** If the respondent changed other answers while B was hidden, B's restored answer may no longer fit. It returns with its error display state as it was (ADR-0004), and the presentation layer announces the reappearance (AC-11.3.2). The respondent sees it, but the engine does not judge whether it still makes sense.
- **Two policies to test.** Every retention, cascade and repeat test runs under both, which roughly doubles that part of the suite.

**Verification**
- SM-02 transition tests under both policies, including cascades of depth 5 and group disablement with repeat instances.
- Leak test from ADR-0010: sentinel answers on hidden items never appear in the emitted response, the scoring projection, rule inputs or condition evaluation.
- A test for AC-02.2.4: C depends on B, B depends on A; hiding B under `retain-exclude` hides C in the same cycle.
- A playground scenario (AC-12.2.1) shows the same hidden answer present in engine state and absent from the emitted response, side by side. This makes the retention policy observable to any integrator.
