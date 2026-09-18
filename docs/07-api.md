# FHIR Questionnaire Kit — Public API

*The contract a host integrates against. Created in M2 with the first public API (`06-roadmap.md` M2 plan D12); M3 added validation, emission and the resume entry point. The API Extractor reports in `packages/*/etc/` are the exact surface; this document is what it means. Next: M4 adds the ports.*

**Status, 2026-09-18.** `@fhirq/core` and `@fhirq/core/resume` are `@beta`. `@fhirq/core/view`, `@fhirq/react`, `@fhirq/element` and `@fhirq/themes` are still M1's `@alpha` spike surface, rewritten in M5–M8.

---

## 1. Rules for the surface

| Rule | How it is held |
|---|---|
| Every export carries a release tag | API Extractor fails on a missing one (`ae-missing-release-tag`) |
| A change to the surface shows as a report diff in the PR | `pnpm api:check` in the required `Engine gates` job (NFR-M-04); `pnpm api:update` rewrites the report |
| A change to the surface adds a changeset in the same commit | `.changeset/`, fixed mode: all four packages share one version (ADR-0008) |
| At most 60 public symbols across all packages | `scripts/test/api-surface.test.js` counts them (NFR-U-05) |
| No `any` in the public surface | `@typescript-eslint/no-explicit-any` everywhere (NFR-M-04) |
| Hosts import entry points only | `fhirq/no-deep-imports` (NFR-M-06) |

**Release tags.**
- **`@beta`:** documented and supported. Before 1.0, a change can land in a minor release, with a report diff and a changeset.
- **`@alpha`:** a spike surface that will be replaced; no compatibility is promised.
- **`@public`:** first used at 1.0.

## 2. Symbol budget (NFR-U-05)

| Entry point | Symbols | Report |
|---|---:|---|
| `@fhirq/core` | 32 | `packages/core/etc/core.api.md` |
| `@fhirq/core/resume` | 3 | `packages/core/etc/core-resume.api.md` |
| `@fhirq/core/view` | 15 | `packages/core/etc/core-view.api.md` |
| `@fhirq/react` | 2 | from M6 |
| `@fhirq/element` | 2 | from M7 |
| `@fhirq/themes` | 1 | from M8 |
| **Total** | **55 of 60** | |

**Allocation (`06-roadmap.md` M3 D3).** M3 had at most 5 symbols and used 5: `emitResponse` and `QuestionnaireResponse` in `@fhirq/core`, and `snapshot`, `restoreSession` and `hydrateSession` in `@fhirq/core/resume`. It paid for the rest in shapes rather than names: cross-field rules are an inline field of `SessionOptions`, the resume functions reuse `SessionOptions`, and a snapshot is typed as JSON. Five symbols remain, for M4's ports and the renderer surfaces. The view's 15 are the likeliest to shrink when M5 replaces the spike's per-control node types; if M4 needs more than five, that is an NFR-U-05 decision, not a quiet overrun.

## 3. `@fhirq/core`

### 3.1 Creating a session

```ts
import { createSession, itemPath } from '@fhirq/core';

const session = createSession(questionnaire, { loadMode: 'strict', retention: 'retain-exclude' });
session.subscribe((change) => render(session.getSnapshot()));
session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
```

**`createSession(questionnaire, options?)`** is synchronous and performs no I/O (INV-D-11). The session it returns has already settled enablement.

| Option | Values | Default |
|---|---|---|
| `loadMode` | `strict` rejects any construct the kit does not support, listing every finding; `lenient` degrades each towards the safe side with a diagnostic (`04-domain.md` §5.1) | `strict` |
| `retention` | `retain-exclude` keeps a hidden answer out of the response and restores it on re-enable; `discard` erases it and resets a repeating group (ADR-0011) | `retain-exclude` |
| `hostIdentity` | `subject`, `author`, `encounter`, `identifier`, stored verbatim and emitted as given | none |
| `rules` | Cross-field rules (§3.7) | none |

**`Questionnaire`** is FHIR R4 (4.0.1) JSON. The resource's own elements are typed; nested elements are `unknown`, because the codec checks the whole resource at runtime (INV-D-01). A resource type from a FHIR library assigns to it. R5 is rejected, not degraded (ADR-0016).

**It throws only integration errors,** as `FhirqError`:

| `code` | When | `findings` |
|---|---|---|
| `definition-rejected` | The input is not an R4 `Questionnaire`, or it cannot load in the chosen mode | Every finding, as `Diagnostic`s |
| `invalid-options` | An option the session cannot read, including a rule that names an unknown `linkId` or items in repeats that share no instance | empty |
| `invalid-path` | `itemPath` was given something that is not a path | empty |
| `unknown-session` | `emitResponse` or `snapshot` was given an object that is not a session | empty |
| `response-rejected` | `hydrateSession` was given something that is not an R4 `QuestionnaireResponse` | Every finding |
| `snapshot-mismatch` | `restoreSession` was given a snapshot taken against another canonical or version, or one holding paths this questionnaire does not have | A `version-drift` finding naming both canonicals, or the path |
| `snapshot-format` | `restoreSession` was given something that is not a snapshot of this format | empty |

Authoring problems a lenient load degrades are `session.diagnostics`, not errors.

### 3.2 The session

| Member | Contract |
|---|---|
| `getSnapshot()` | The current `SessionState`. **The same reference until a cycle changes something visible,** so it can go straight to `useSyncExternalStore` |
| `subscribe(listener)` | Called **once per cycle** that changed something visible, with that cycle's `SessionChange`. Returns the unsubscribe function. A listener that throws becomes a `listener-threw` diagnostic and the other listeners still run |
| `dispatch(command)` | Runs the command as **one cycle** and returns a `CommandResult`. **Never throws**, even for a malformed command from plain JavaScript |
| `diagnostics` | Load findings, then runtime ones as they happen |

`subscribe`, `getSnapshot` and `dispatch` are closures and may be passed detached.

**One command, one cycle, at most one notification** (ADR-0009). A cycle guards the command, applies it, settles every condition it affects, validates, publishes and then notifies. No listener sees a cycle in progress. A command dispatched from inside a listener returns `deferred`, then runs in its own cycle straight after.

### 3.3 Commands

| `type` | Fields | Effect |
|---|---|---|
| `SetAnswer` | `path`, `answers` | Replaces the node's answers. More than one answer only on a repeating question |
| `ClearAnswer` | `path` | Removes every answer |
| `AddRepeatInstance` | `path` (the group) | Appends an empty instance with a never-used ordinal |
| `RemoveRepeatInstance` | `path`, `ordinal` | Destroys that instance and its answers |
| `NoteItemLeft` | `path` | The respondent left the item: its issues surface |
| `RequestCompletion` | — | Completes when no issue is an `error`, or is refused with `validation-errors`, surfaces every node with an issue and shows form-level issues |

**`CommandResult`** is one of:
- `applied`;
- `unchanged`: valid, but nothing changed;
- `deferred`: dispatched during a cycle;
- `refused`, with a `RefusalReason`.

A refusal changes nothing, except that a refused completion surfaces issues.

| `RefusalReason` | Why |
|---|---|
| `malformed-command` | Not a command |
| `unknown-path` | No enabled or disabled node has this path |
| `session-completed` | The session is completed; completion is final |
| `node-disabled` | The node, or an ancestor, is disabled (ADR-0002) |
| `node-calculated` | The item is bound to a calculation (ADR-0003) |
| `not-answerable` | A group, display item or unsupported placeholder |
| `empty-answers` | `SetAnswer` with no answers; use `ClearAnswer` |
| `too-many-answers` | More than one answer on a non-repeating item |
| `invalid-answer` | An answer that is not a well-formed `Answer` |
| `type-mismatch` | An answer kind the item does not accept |
| `not-repeating` | A repeat command on a node that is not a repeating group |
| `at-max-occurs` | `AddRepeatInstance` at or over `maxOccurs`. Removing is never refused on cardinality |
| `unknown-instance` | `RemoveRepeatInstance` with an ordinal that is not live |
| `validation-errors` | `RequestCompletion` while an issue remains |

### 3.4 State

**`SessionState`:**
- `status`: `in-progress` or `completed`;
- `cycle`: increments once per visible change;
- `nodes`: the effectively enabled nodes, in document order;
- `issues`: the validation result (§3.7);
- `completionRefused`;
- `change`: the `SessionChange` that produced this state, or `null` for the initial state.

**`NodeState`:**
- `path` and `item` (an `ItemDefinition`);
- `answers`;
- `instances`: a repeating group's live ordinals, in order;
- `issues`: every current issue, surfaced or not;
- `surfaced`.

**A node object keeps its identity across cycles while nothing about it changed,** so a renderer can skip it by reference.

**`SessionChange`** lists paths only, never values (NFR-X-04):
- `enabled`, `disabled`, `surfaced`, `added` and `removed` paths;
- `completion`;
- `responseChanged`: whether the emitted response would differ.

**Answers.** `Answer` is a tagged union on `kind`: `boolean`, `decimal`, `integer` (32-bit), `date`, `dateTime`, `string`, `coding`, `quantity`.
- `date` and `dateTime` stay strings, with their precision as written, and are never shifted through UTC.
- A `text` item takes `string` answers.
- A `choice` item takes the kinds its options have. An `open-choice` item takes those kinds plus `string`.

### 3.5 Paths

An `ItemPath` addresses one node. Its segments are `linkId`s joined by `/`, and a repeat instance adds `[ordinal]` to its group's segment, as in `meds[2]/dose`.
- **Build paths with `itemPath`,** for example `itemPath('meds', 2, 'dose')`. Each `linkId` is percent-encoded, so an authored `/` or `[` is never read as structure.
- **Ordinals are identity, not position.** They are never reused, so a path stays valid while other instances come and go.
- **Key state, ids and React keys on the path,** never on `linkId` alone.

### 3.6 Diagnostics

`Diagnostic` is `{ code, severity, path, related, detail }`:
- `path` is the `linkId` path of the item at fault, or `null` for the whole questionnaire;
- `related` lists the other `linkId`s the finding names;
- `detail` is the authored name involved: an item type, an extension URL, an R4 constraint key, an operator.

**No diagnostic or error ever holds an answer value** (NFR-X-04, INV-D-10).

**Severity.**
- `error`: a finding that rejects a `strict` load. It stays `error` in a lenient load, so a host can tell a degraded item from a remark.
- `warning`: a finding that never rejects.

There is one `DiagnosticCode` per invariant of `04-domain.md` §5.1, plus the runtime `listener-threw` and `rule-threw`, and hydration's four (§4.3). A hydration diagnostic may also carry `expected` and `found`: two answer kinds, two canonicals or two answer counts, never a value (INV-E-09).

### 3.7 Validation

`SessionState.issues` is the validation result (AC-04.4.1): every current issue, surfaced or not, in document order and repeat position, form-level issues first. Each `NodeState.issues` holds that node's share. An `Issue` is:
- `code`: `required`, `min-occurs`, `max-occurs`, `max-length`, `max-decimal-places`, `min-value`, `max-value`, `unit-missing`, or `rule` for a cross-field rule;
- `severity`: `error` blocks completion, `warning` does not;
- `path` and `linkId`, both `null` for a form-level issue;
- `message`: the message catalogue key, which is the code for a built-in rule;
- `params`: what the message names, such as `{ limit: 5 }`. **Never the entered value** (NFR-X-04): the view adds it when it renders (`06-roadmap.md` M3 D1).

Only enabled items have issues: a hidden required item never blocks completion (INV-V-01). The engine holds typed answers only, so it reports a date outside its range but never "not a date"; the view model reports that on a draft from M5. A date of another precision than its limit raises nothing.

**Surfacing** is `blur-then-live` (SM-03). An issue surfaces when the respondent leaves its item, or on a refused completion; once live, a node stays live, across hide and show too. Form-level issues show after a refused completion (`completionRefused`).

**Cross-field rules** are `SessionOptions.rules`, fixed for the session's life:

```ts
createSession(questionnaire, {
  rules: [{
    inputs: ['systolic', 'diastolic'],
    check: ({ systolic, diastolic }) =>
      (systolic?.[0]?.value ?? 0) <= (diastolic?.[0]?.value ?? 0) ? 'bp-order' : null,
  }],
});
```

- **`inputs`** name items by `linkId`. The rule runs once per instance of the innermost repeating group they share, as `enableWhen` does: in `reading[2]` it reads `reading[2]`'s items and those outside every repeat.
- **It is skipped** wherever any item it names is disabled, and never sees a retained answer (INV-V-03).
- **`check`** receives the visible answers, frozen, and returns a message catalogue key or `null` (INV-V-10).
- **The issue attaches to `targets`**, which default to `inputs`; `targets: []` makes it form-level. `severity` defaults to `error`.
- **A rule that throws** contributes nothing and becomes one `rule-threw` diagnostic per rule, naming `rules[i]`, never the thrown text (INV-V-05).
- **A snapshot does not hold rules,** so `restoreSession` needs the same ones.

### 3.8 Emission

```ts
import { emitResponse } from '@fhirq/core';

const response = emitResponse(session, { authored: '2026-09-18T10:00:00+02:00' });
```

**`emitResponse(session, options?)`** returns a FHIR R4 `QuestionnaireResponse` (AC-05.1.1):
- **`questionnaire`** is the questionnaire's `url|version`, or `url` alone; it is absent when the questionnaire declares no `url`;
- **`status`** is the session's: `in-progress`, or `completed` once a completion passed validation;
- **`subject`, `author`, `encounter` and `identifier`** are the host identity, verbatim, and absent when not given;
- **`authored`** is the caller's FHIR `dateTime`, or the current instant in UTC;
- **`item`** mirrors the questionnaire for the enabled, answered items only.

A hidden item is absent, never present with an empty answer, whatever the retention policy holds for it (INV-E-01). A repeating group is one item per instance in position order, and an instance with nothing answered is left out. Display items and lenient placeholders never appear. The items are built once per cycle and shared between calls, frozen. `QuestionnaireResponse` types the resource's own elements and leaves nested ones `unknown`, as `Questionnaire` does.

## 4. `@fhirq/core/resume`

```ts
import { hydrateSession, restoreSession, snapshot } from '@fhirq/core/resume';
```

A third entry point (ADR-0021), so that hosts that never resume, and the element, do not carry this code. Its functions take the `Questionnaire`, `QuestionnaireResponse`, `Session` and `SessionOptions` of `@fhirq/core`, and return a `Session`.

### 4.1 Two ways back, deliberately different

| | Source | Keeps retained answers | Keeps surfacing and status | Across questionnaire versions |
|---|---|---|---|---|
| **Restore** | A snapshot | Yes | Yes | No: refused |
| **Hydrate** | An emitted response | No: never emitted | No: always `in-progress`, nothing surfaced | Yes, with diagnostics |

A host that wants hidden answers to survive a reload persists the snapshot. The snapshot is engine state, not a clinical record: it holds answers the response leaves out, so it needs the same care as the response.

### 4.2 Snapshot and restore

- **`snapshot(session)`** returns JSON with `format: 'fhirq-snapshot/1'`: every node's answers including retained ones, repeat ordinals and positions, what is surfaced, the status, the load mode, the retention policy, the host identity, and the questionnaire's canonical (AC-05.3.1).
- **`restoreSession(questionnaire, snapshot, options?)`** returns a session indistinguishable from the one the snapshot was taken from (INV-E-07), a completed one included.
  - The load mode, retention policy and host identity are the snapshot's. `options` may repeat the load mode and retention but not change them, and may not give a host identity: `invalid-options`.
  - `options.rules` supplies the cross-field rules, which a snapshot does not hold.
  - Another canonical or version is refused with `snapshot-mismatch`, naming both: a snapshot is not a migration format (AC-05.3.3). A different format is `snapshot-format` (A5).

### 4.3 Hydration

**`hydrateSession(questionnaire, response, options?)`** resumes from a stored `QuestionnaireResponse` (US-06.1, `04-domain.md` §8). It loads every answer that fits, rebuilds repeat instances at their stored counts in stored order, settles enablement, and starts `in-progress` whatever the stored status. The host identity is `options.hostIdentity`, or else the response's own `subject`, `author`, `encounter` and `identifier`.

What does not fit is never loaded and never emitted. It is a `warning` in `session.diagnostics`, in document order:

| Code | When | Names |
|---|---|---|
| `version-drift` | The stored canonical names another `url` or version | `expected` and `found` canonicals |
| `orphan-answer` | A stored `linkId` the questionnaire does not have, or not at that place | The path |
| `quarantined-answer` | An answer the item cannot hold; several on a single-answer item; a single-answer item stored twice; an answer on a group or a calculated item | The path, `expected` and `found` kinds or counts |
| `hydrated-answer-disabled` | An answer on an item that is disabled once everything is loaded | The path |

Hydration never fails because of content (INV-E-08). It throws only `definition-rejected` and `invalid-options`, as `createSession` does, and `response-rejected` for something that is not an R4 `QuestionnaireResponse`. A session emitted, hydrated and emitted again gives the same response, `authored` and `status` aside (INV-E-06).

## 5. `@fhirq/core/view` (`@alpha`)

M1's presentation-model spike: `createView(session, options)` returns a `View` with `subscribe` and `getSnapshot`, and a `ViewModel` of yes/no and short-text nodes with their ids, issues, announcement, error summary and focus target (ADR-0007). It renders only `boolean` and `string` items until M5 replaces it with the full view model. Its report notes three types it reaches without exporting them: two from `@fhirq/core`, which API Extractor does not follow across a package's two entry points, and one internal base interface. M5 resolves both when it fixes the view's surface.

## 6. Not in the API yet

- **M4:** the value-set resolver, scorer, expression evaluator and sanitizer ports, and the message catalogue's overrides.
- **M5–M8:** the full view model, the React hook and default UI, the custom element's attributes and events, and the theme tokens.
