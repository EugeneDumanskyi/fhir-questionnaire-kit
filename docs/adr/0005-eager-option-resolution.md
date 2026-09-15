# ADR-0005 — Options are resolved at session start and not snapshotted

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** US-07.1 (AC-07.1.1–4), AC-05.3.3, NFR-X-01, NFR-X-03 · INV-X-01–03, SM-04 · `04-domain.md` §9.1 D5

## Context

Some `choice` and `open-choice` items list their options by reference to a `ValueSet` URL rather than inline. The engine never fetches anything itself. The host supplies an asynchronous resolver, called at most once per distinct URL per session (US-07.1). For the embed case, a default resolver performs a plain GET against a configured base URL (AC-07.1.3). Whatever resolver is used, the calls may reach a server the host does not control, such as a public or commercial terminology service.

That leaves two questions: **when** to call the resolver, and **whether the results belong in the snapshot**.

On timing: in a clinical form, which options get requested can reveal clinical information. Suppose the value set for substance types is only requested once the respondent has answered "yes" to substance use. The request itself, its timing, and any log line on the receiving server then disclose that answer. The brief promises no PHI (protected health information) handling. A disclosure through request patterns is still a disclosure, even though no answer value ever leaves the library.

## Decision

**When.** As soon as a session is ready, the resolver is invoked once for every distinct `ValueSet` URL the questionnaire references, whether or not any item using that value set is currently enabled. Retries happen only on an explicit retry after a failure (AC-07.1.2).

**Snapshot.** Resolved options are not part of the snapshot. Restoring a snapshot resolves them again, just like a fresh session.

**While unresolved** (pending, failed, or no resolver configured):
- the item accepts no coded answer, though free text on `open-choice` is still accepted;
- coded answers that came from resume or restore are kept and are not marked invalid (AC-07.1.4);
- the rest of the form stays fully interactive.

## Alternatives considered

**A. Resolve lazily, when an item first becomes enabled.** Rejected. It turns the resolver's call pattern into a record of the respondent's path through the form, which is the disclosure described above. It also puts the wait at the worst moment: the loading state appears exactly when the respondent reaches the question.

**B. Resolve lazily, when an item is first rendered or scrolled into view.** Rejected for the same disclosure reason. It would also tie a domain behaviour to presentation details that differ between tiers.

**C. Require the host to pass all option lists in when creating the session.** Rejected as the only mechanism. Every host would have to walk the questionnaire, find the references and handle failures before rendering anything, and per-item pending and retry behaviour would disappear. A host that wants this can still get it: its resolver can answer from a cache it filled in advance.

**D. Store resolved options in the snapshot.** Rejected, for three reasons:
- Staleness: restoring would silently bring back an option list that may have been updated since.
- Size: value set expansions can dwarf the answers they support.
- Scope: a snapshot is the respondent's state, and reference data does not belong in it. A host deciding where to store snapshots should not also have to think about third-party content inside them.

## Consequences

**Benefits**
- **Which options get requested depends only on the questionnaire, never on the answers.** This is a privacy property that can be tested directly (see Verification).
- Options are usually ready before the respondent reaches the item.
- Snapshots stay small and contain only respondent state.

**Costs accepted**
- **Value sets are resolved for branches the respondent never sees.** A questionnaire with many referenced value sets costs the host requests it might otherwise have avoided. Caching and throttling are the host's concern, consistent with resolver injection.
- **Session start triggers several resolver calls at once.** Hosts with rate-limited services must throttle inside their resolver.
- **Restoring needs the resolver again.** Offline, coded items show a pending state after restore. Their existing coded answers are still displayed, but new coded answers cannot be entered until the options arrive.
- **Retries still leak a little.** An explicit retry for an item shows that the respondent, or the host, cared about that item after a failure. This is accepted because it happens only after a failure and only on explicit action, and the alternative (automatic retries) is forbidden by AC-07.1.2.

## Verification

- **Path-independence test:** run two sessions over the same questionnaire with answer sequences that take different branches. Record every resolver call, then assert the two sets of URLs are identical and each URL was called exactly once.
- **Restore test:** assert that the snapshot contains no option data, and that restore triggers resolution for every referenced URL.
- **Test for AC-07.1.4:** with the resolver pending and with it failed, assert that resumed coded answers are present and raise no validation issues.
