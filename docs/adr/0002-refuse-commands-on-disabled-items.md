# ADR-0002 — Commands against disabled items are refused

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** AC-05.2.1, AC-05.2.5, AC-06.1.5, US-10.3, US-10.4 · INV-S-14, SM-02 · `04-domain.md` §9.1 D2

## Context

Under the default `retain-exclude` policy, an item that becomes disabled keeps its answer internally and leaves it out of everything downstream: the emitted response, validation, scoring, rules and conditions. When the item is enabled again, the answer comes back (AC-05.2.1). The point of retention is that a mis-click never costs the respondent work they already did.

Answers do not only come from the default UI. A slot component (tier 3) or a headless host (tier 4) can issue a set or clear command for any item path, at any time. Some cases are ordinary bugs: a slot component holding a stale reference after its item was hidden, or a host pre-filling fields from its own data without checking which items are enabled.

So the engine has to decide what a command against a disabled item means.

## Decision

A set or clear command against an item that is not enabled (its own condition, or any ancestor group, disables it) is refused. So is adding or removing an instance of a disabled repeating group. A refusal is not an exception: the command produces an evaluation cycle that changes nothing and returns a reason code. The retained answer, if there is one, is untouched.

A hidden answer can be restored by re-enabling its item. It can never be edited while hidden.

## Alternatives considered

**A. Accept the command and store the value silently.** Rejected on patient-safety grounds. When the item is enabled again, the respondent would see a value presented as their own earlier input that they never entered. Retention restores *what the respondent entered while the question was visible*. Letting anything else in turns retention from protection against lost work into a channel for unseen data to reach a clinical record.

**B. Accept the command and enable the item.** Rejected. Whether an item is enabled must depend only on answers and the questionnaire's conditions. A command that changes enablement as a side effect would make an item's visibility depend on who called what, breaking the order-independence guarantee (AC-02.2.2).

**C. Throw an exception.** Rejected. The most common cause is a race between the UI and a state change: the respondent clicks an option in the same moment an earlier answer hides it. An exception would turn that race into a crash in the host's form, which is exactly what AC-04.3.2 rules out for host-supplied rules.

**D. Refuse `set` but allow `clear`, so a host can wipe hidden data.** Considered seriously, because erasing data has privacy appeal. Rejected for v1. The `discard` retention policy is already the supported way to erase hidden answers, and requirement R6 excludes per-item retention overrides. Allowing only `clear` would be a per-item override by another name. Worth revisiting if hosts ask for it.

## Consequences

**Benefits**
- **Retained answers have known provenance.** Every retained answer was entered while its item was visible. The retention ADR, the round-trip tests and a clinical reviewer can all rely on that.
- The per-item answer state machine (SM-02) has no transitions out of the disabled states other than re-enablement, so it stays small enough to test exhaustively.
- Refusals carry reason codes, so UI bugs show up as diagnosable signals instead of silent corruption.

**Costs accepted**
- **Hosts cannot pre-fill hidden items.** A host that wants to fill fields from existing records before the respondent answers the gating question cannot do it through commands, and cannot do it through resume either, because AC-06.1.5 drops stored answers that land on disabled items. Pre-filling conditionally hidden items is not supported in v1. This is consistent with SDC population features being out of scope, and needs a `not supported` row in the conformance matrix when it is written.
- Headless integrators must handle a refusal result instead of assuming every command succeeds. That is a small addition to the API surface and it must be documented.

## Verification

- A property test generates command sequences and asserts that no retained answer ever holds a value it did not have at the moment its item became disabled.
- A unit test issues set, clear, add-instance and remove-instance against disabled items, and against items in disabled ancestor groups, and asserts each is refused with a reason code, emits no change event, and leaves engine state unchanged.
