# ADR-0004 — Validation timing and ownership

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** US-04.1–04.4 (incl. AC-04.2.3, AC-04.2.4, AC-04.3.4), AC-05.3.1, AC-11.3.1, AC-12.4.1, NFR-U-03, NFR-U-05, NFR-M-05 · INV-V-01–10, SM-03 · `04-domain.md` §9.1 D4

## Context

Validation asks two separate questions. **What is wrong?** That is a pure function of the answers and the rules. **What has the respondent been told is wrong?** That depends on what they have done so far.

Getting the second question wrong is hostile in either direction. An error that appears while the respondent is still typing ("not a date" after the first digit) punishes them for being mid-entry, and repeats noisily through a screen reader. An error that stays on screen after the value has been fixed makes them doubt the correction. Clinical forms are long, so small annoyances add up over dozens of items.

Several requirements constrain the answer:
- The default is blur-then-live (AC-04.2.3), configurable per NFR-U-03.
- Completion must check every error, whether shown or not (AC-04.1.1).
- Switching customization tier must preserve state (AC-12.4.1).
- Restoring a snapshot must reproduce the session exactly (AC-05.3.1).
- Cross-field rules can name several items, or none (AC-04.3.1).

This ADR also covers ownership, as NFR-M-05 requires: which part of the system decides what.

## Decision

**Ownership.**

| Concern | Owner |
|---|---|
| Built-in checks derived from the questionnaire (required, ranges, lengths, decimals, dates, units, occurrence counts) | Engine |
| Cross-field rules | Host, as pure synchronous functions over the visible view |
| Whether an item's errors are currently shown | Engine |
| Message wording | Host, through the message catalogue, with built-in defaults |
| Where and how errors render, the error summary, focus movement | Presentation |

**Timing.** Each item has a stored display state: *quiet* or *live*.
- A quiet item moves to live when the respondent leaves it while it has an issue, or when a completion attempt is refused while it has an issue. Typing alone never makes an item live.
- A live item is re-validated on every change, so its error clears as soon as the value is valid and returns the moment it becomes invalid again.
- **A live item never returns to quiet,** whether it is corrected, or hidden and shown again.
- A cross-field issue appears on each item it names, according to that item's own display state. A form-level issue, which names no item, appears only when completion is refused.
- Completion considers every issue on enabled items, regardless of display state.

The display state is part of engine state and of the snapshot. Other timing modes allowed by NFR-U-03 change only what moves an item from quiet to live. The rule that live never returns to quiet holds in every mode.

## Alternatives considered

**A. Validate on every keystroke.** Rejected. It shows errors for values that are merely incomplete, and floods assistive technology with announcements.

**B. Validate only on blur, always.** Rejected. After fixing a value, the respondent keeps seeing the error until they leave the field, which reads as the fix not working.

**C. Return a corrected item to quiet.** Rejected. If the respondent then breaks the value again, it fails silently until the next blur. Feedback on one field would change behaviour depending on its history in a way the respondent cannot see.

**D. Reset display state when an item is hidden.** Rejected. If the item comes back with an invalid retained answer, it would look valid, and the next completion attempt would surface the error anyway. The reset buys nothing but a later surprise, and it throws away what the respondent was already told.

**E. Let presentation own display state.** Rejected. Every slot component and headless integration would reimplement it and drift apart. Switching tier would lose it, breaking AC-12.4.1. A restored snapshot could not reproduce what the respondent had seen.

**F. Show a cross-field error on every named item as soon as any of them is left.** Rejected. It would put an error on an item the respondent has not reached yet. For example, "end date before start date" would appear on an end date they have not entered.

## Consequences

**Benefits**
- Errors behave the same in every tier, because the behaviour lives in the one layer they all share.
- The validation result stays a pure, serializable function (AC-04.4.1). Only display state is stored, and it is small.
- Snapshots reproduce what the respondent was told, not only what they entered.

**Costs accepted**
- **The engine holds state that exists to support a UI concern,** and needs a command meaning "the respondent left this item". That command counts against the public API budget (NFR-U-05), and headless integrators must call it to get default behaviour.
- **Form-level cross-field errors stay invisible until completion.** Rule authors who want earlier feedback must attach the message to specific items.
- An item that was live, then hidden and shown again, may display an error straight away. That is intended, but may surprise someone who expects a re-shown item to start fresh. It must be documented.

## Verification

- State machine tests cover every SM-03 transition, including hide and show while live, and a refused completion with a mix of quiet and live items.
- A test switches tier mid-session and asserts that display state is unchanged.
- A restore test asserts that items which were live in the snapshot are live after restore, including hidden ones.
- An automated accessibility run asserts that typing into a quiet item produces no announcement.
