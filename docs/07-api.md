# FHIR Questionnaire Kit — Public API

*The contract a host integrates against. Created in M2 with the first public API (`06-roadmap.md` M2 plan D12); M3 added validation, emission and the resume entry point; M4 the ports; M5 the full presentation model. The API Extractor reports in `packages/*/etc/` are the exact surface; this document is what it means. Next: M6's React adapter.*

**Status, 2026-09-23.** `@fhirq/core` and `@fhirq/core/resume` are `@beta`. `@fhirq/core/view` is complete and `@alpha` until M6 and M7 have built on it. `@fhirq/react`, `@fhirq/element` and `@fhirq/themes` are still M1's `@alpha` spike surface, rewritten in M6–M8.

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
| `@fhirq/core` | 35 | `packages/core/etc/core.api.md` |
| `@fhirq/core/resume` | 3 | `packages/core/etc/core-resume.api.md` |
| `@fhirq/core/view` | 15 | `packages/core/etc/core-view.api.md` |
| `@fhirq/react` | 2 | from M6 |
| `@fhirq/element` | 2 | from M7 |
| `@fhirq/themes` | 1 | from M8 |
| **Total** | **58 of 60** | |

**Allocation (`06-roadmap.md` M3 D3).** M3 had at most 5 symbols and used 5: `emitResponse` and `QuestionnaireResponse` in `@fhirq/core`, and `snapshot`, `restoreSession` and `hydrateSession` in `@fhirq/core/resume`. It paid for the rest in shapes rather than names: cross-field rules are an inline field of `SessionOptions`, the resume functions reuse `SessionOptions`, and a snapshot is typed as JSON. Five symbols remain, for M4's ports and the renderer surfaces. The view's 15 are the likeliest to shrink when M5 replaces the spike's per-control node types; if M4 needs more than five, that is an NFR-U-05 decision, not a quiet overrun.

**M4 (`06-roadmap.md` M4 D1)** used 3: `OptionResolver`, `ExpressionEvaluator` and `VisibleProjection`, the port types ADR-0012 and ADR-0017 name. Scorers, the sanitizer and the error handler are inline `SessionOptions` fields, as rules are; `RetryOptions` is a command and `dispose` a session member, neither a symbol. **Two remain** for M5–M8; the view's 15 are still the likeliest to shrink.

**M5 (`06-roadmap.md` M5 D10)** kept the view at 15: the spike's per-kind node types (`YesNoViewNode`, `ShortTextViewNode`, `YesNoChoice`, `ErrorSummaryEntry`) went, and `ControlView`, `ControlProps`, `ChoiceView` and `InstanceView` came. One `ViewNode` union covers every kind, with its shared fields written inline, so no base type is left unexported. `ItemDefinition.units` is a field, not a symbol. **Two remain** for M6–M8.

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
| `scorers` | Scoring functions by name (§3.9) | none |
| `resolver` | An `OptionResolver` for `answerValueSet` (§3.9) | none: coded answers on those items are refused |
| `evaluator` | An `ExpressionEvaluator` for `calculatedExpression` (§3.9) | none: calculated items have no value |
| `sanitize` | `(xhtml) => string`, for `rendering-xhtml` rich text (§3.9) | none: rich text is dropped and the plain text renders |
| `onCollaboratorError` | `(error, diagnostic) => void`: what any collaborator threw or rejected with, verbatim (§3.9) | none |

**`Questionnaire`** is FHIR R4 (4.0.1) JSON. The resource's own elements are typed; nested elements are `unknown`, because the codec checks the whole resource at runtime (INV-D-01). A resource type from a FHIR library assigns to it. R5 is rejected, not degraded (ADR-0016).

**It throws only integration errors,** as `FhirqError`:

| `code` | When | `findings` |
|---|---|---|
| `definition-rejected` | The input is not an R4 `Questionnaire`, or it cannot load in the chosen mode | Every finding, as `Diagnostic`s |
| `invalid-options` | An option the session cannot read, including a rule or scorer that names an unknown `linkId`, a rule over items in repeats that share no instance, or a collaborator that is not a function (or an evaluator without `evaluate`) | empty |
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
| `dispose()` | Ends the session: aborts the resolver's signal, drops any resolution that settles later, and refuses every later command as `disposed`. Idempotent |

`subscribe`, `getSnapshot` and `dispatch` are closures and may be passed detached.

**One command, one cycle, at most one notification** (ADR-0009). A cycle guards the command, applies it, settles every condition it affects, validates, publishes and then notifies. No listener sees a cycle in progress. A command dispatched from inside a listener returns `deferred`, then runs in its own cycle straight after. A command dispatched from inside a collaborator (a rule, scorer, evaluator, resolver or sanitizer call) is refused as `collaborator-running` (M4 AC-6). A resolution that settles runs as a cycle of its own, whose change has `command: 'OptionsSettled'` (T12).

### 3.3 Commands

| `type` | Fields | Effect |
|---|---|---|
| `SetAnswer` | `path`, `answers` | Replaces the node's answers. More than one answer only on a repeating question |
| `ClearAnswer` | `path` | Removes every answer |
| `AddRepeatInstance` | `path` (the group) | Appends an empty instance with a never-used ordinal |
| `RemoveRepeatInstance` | `path`, `ordinal` | Destroys that instance and its answers |
| `NoteItemLeft` | `path` | The respondent left the item: its issues surface |
| `RequestCompletion` | — | Completes when no issue is an `error`, or is refused with `validation-errors`, surfaces every node with an issue and shows form-level issues |
| `RetryOptions` | `valueSet` (the canonical, as the questionnaire gives it) | Calls the resolver again for a set that failed. The set is `pending` until it settles |

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
| `options-unresolved` | A coded answer on an item whose value set is not `resolved`. Free text on `open-choice` is still accepted |
| `options-not-failed` | `RetryOptions` for a set that is not `failed`, or that the questionnaire does not name |
| `collaborator-running` | Dispatched from inside a collaborator call |
| `disposed` | The session was disposed |

### 3.4 State

**`SessionState`:**
- `status`: `in-progress` or `completed`;
- `cycle`: increments once per visible change;
- `nodes`: the effectively enabled nodes, in document order;
- `issues`: the validation result (§3.7);
- `completionRefused`;
- `change`: the `SessionChange` that produced this state, or `null` for the initial state;
- `optionSets`: each value set canonical the questionnaire names, with its `status` (`pending`, `resolved`, `failed` or `unresolved`) and its `options` once resolved (SM-04);
- `scores`: each scorer's result by name, or `null` while it has none (§3.9).

**`NodeState`:**
- `path` and `item` (an `ItemDefinition`; its `xhtml` is the sanitizer's output for authored rich text, or `null`, and its `units` are a quantity's `questionnaire-unitOption` codings in authored order, empty on any other type);
- `answers`;
- `instances`: a repeating group's live ordinals, in order;
- `issues`: every current issue, surfaced or not;
- `surfaced`.

**A node object keeps its identity across cycles while nothing about it changed,** so a renderer can skip it by reference.

**`SessionChange`** lists paths only, never values (NFR-X-04):
- `command`: the command's `type`, or `OptionsSettled`;
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

There is one `DiagnosticCode` per invariant of `04-domain.md` §5.1, plus the runtime `listener-threw` and `rule-threw`, the collaborators' six (§3.9), and hydration's four (§4.3). A hydration diagnostic may also carry `expected` and `found`: two answer kinds, two canonicals or two answer counts, never a value (INV-E-09).

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

### 3.9 Collaborators

What the host plugs in (BC5, `04-domain.md` §3.5). Each is a `SessionOptions` field, fixed for the session's life. None performs I/O on core's behalf: whatever a resolver does is the host's.

```ts
createSession(questionnaire, {
  resolver: (valueSet, { signal }) => terminology.expand(valueSet, { signal }),
  scorers: { total: { inputs: ['q1', 'q2'], score: (projection) => sumOrdinals(projection) } },
  evaluator: { evaluate: (expression, { path, projection }) => fhirpath(expression, projection) },
  sanitize: (xhtml) => purify(xhtml),
  onCollaboratorError: (error, diagnostic) => report(error, diagnostic.code),
});
```

**Every call goes through one guard.**
- A command dispatched inside it is refused as `collaborator-running`.
- A throw clears what the call would have produced. It becomes a `warning` diagnostic that carries a code and a path or name, never the thrown text, and the form stays live (INV-X-09).
- What was thrown goes to `onCollaboratorError`, verbatim, and never into state. A handler that throws is `listener-threw`.
- Each failure is reported once per collaborator per session (once per path for the evaluator), so diagnostics cannot grow without bound. `resolver-failed` is the exception: it is reported once per failure.

**`VisibleProjection`** is what scorers and the evaluator read: `{ status, nodes }`, each node with its `path`, its item's `linkId` and `type`, and its `answers`. Only enabled nodes are included, in document order, and the whole thing is deeply frozen. A hidden node's retained answer is never in it (INV-X-04). Rules keep their own shape (§3.7).

| Field | Contract | Diagnostics |
|---|---|---|
| `resolver` | `OptionResolver`: `(valueSet, { signal }) => PromiseLike<{ system?, code, display? }[]>`. Called once per distinct canonical, at creation (restore and hydration included), whatever is enabled (ADR-0005, INV-X-01). It is called again only on `RetryOptions`. `signal` aborts on `dispose()`. A hydrated coded answer is loaded whatever the set's state (T8) | `unresolved-options` on each item when there is no resolver (`detail`: the canonical); `resolver-failed` on a rejection, a throw or a list that is not options (`detail`: the canonical) |
| `scorers` | By name: `inputs` (`linkId`s) and `score(projection)`. A scorer runs when a visible node of its inputs, or its answers, changed. The result is opaque: stored in `SessionState.scores[name]` and never read by the engine (INV-X-05). It is not emitted and not in a snapshot; it is recomputed on restore | `scorer-threw` (`detail`: the name); the score is `null` |
| `evaluator` | `ExpressionEvaluator`: `evaluate({ language, expression, name? }, { path, projection })` returns an `Answer` or `undefined`, synchronously. It is called for `calculatedExpression` only (ADR-0017), each cycle that changed answers or enablement, in document order: a calculated item that reads a later one sees the previous cycle's value (ADR-0009). The value is read-only (ADR-0003), emitted like an answer, and not in a snapshot. With an evaluator, a stored answer on a calculated item is replaced on hydration rather than quarantined | `no-evaluator` only when there is none; `evaluator-threw` on a throw, and with `detail: 'type'` for a value the item cannot hold; the value is cleared |
| `sanitize` | `(xhtml) => string`. It runs once per rich-text item as the session opens, and its output is `ItemDefinition.xhtml`. The raw markup is never kept (INV-X-06) | `no-sanitizer` when there is none; `sanitizer-threw` on a throw, and with `detail: 'type'` for a result that is not a string; `xhtml` is `null` |
| `onCollaboratorError` | `(error, diagnostic)`: the thrown value or rejection reason, and the diagnostic it became. Called on every failure, including those not reported again | a throwing handler is `listener-threw` |

`restoreSession` and `hydrateSession` take the same fields, so a restored session resolves, scores and calculates again. A snapshot holds none of their results.

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
| `quarantined-answer` | An answer the item cannot hold; several on a single-answer item; a single-answer item stored twice; an answer on a group, or on a calculated item when there is no evaluator | The path, `expected` and `found` kinds or counts |
| `hydrated-answer-disabled` | An answer on an item that is disabled once everything is loaded | The path |

Hydration never fails because of content (INV-E-08). It throws only `definition-rejected` and `invalid-options`, as `createSession` does, and `response-rejected` for something that is not an R4 `QuestionnaireResponse`. A session emitted, hydrated and emitted again gives the same response, `authored` and `status` aside (INV-E-06).

## 5. `@fhirq/core/view` (`@alpha`)

The presentation model (ADR-0007): every BC6 behaviour that is not markup, written once, for both renderers and for a headless host (tier 4, ADR-0013). `createView(session, options)` returns a `View` whose `subscribe` and `getSnapshot` go straight into `useSyncExternalStore`. `getSnapshot` returns one `ViewModel` until the session or the text being typed changes. The view holds no domain state: another view over the same session, with another locale or prefix, changes nothing in it (INV-P-01).

```ts
import { createSession } from '@fhirq/core';
import { createView } from '@fhirq/core/view';

const view = createView(createSession(questionnaire), { idPrefix: 'intake', locale: 'en-GB', timeZone: 'Europe/London' });
const model = view.getSnapshot();
```

### 5.1 Options

| Option | Meaning |
|---|---|
| `idPrefix` | Prefixes every id, so two forms on a page cannot collide |
| `locale` | Required. BCP 47; every date, number and count is formatted in it through `Intl` (ADR-0020). Never read from the environment |
| `timeZone` | IANA. A `dateTime` with a time is shown in it, and a typed time of day is read in it. Without it, a `dateTime` is shown at its own offset and a time must be typed with its offset: the view never assumes UTC |
| `messages` | Catalogue overrides, key by key (below) |

### 5.2 The model

`ViewModel` has `nodes` (the top-level nodes), `announcement`, `errorSummary`, `focusTarget`, `completed`, `requiredMarker`, and `labels` (fixed strings a renderer shows: `retry`, `other`, `unit`, `choose`).

**The tree (M5 plan D1).** A `group` node holds `children`. A `repeating-group` node holds `instances`, each an `InstanceView` with its own `children`, `path`, `number` (1-based place), `label` ("Medicine 2"), `ids` and `remove`. **Identity:** a node is a new object only when its node state, its option set, its draft or something under it changed. An unchanged subtree keeps its object, so `React.memo` and the element's patcher skip it by reference (AC-4). Commands are bound once per path.

**Every node** has `path`, `control` (a `ControlKind`), `label`, `richLabel` (the host-sanitized `rendering-xhtml`, else `null`), `description` (always `null` in v1, M5 plan D5), the four `ids` (`control`, `label`, `description`, `error`, from the item path, INV-P-02), `required`, `invalid`, `issues` (surfaced only, each a `ViewIssue` with `rule` and a filled-in `message`) and `leave()`.

| `control` | For | Carries |
|---|---|---|
| `yes-no` | `boolean` | `value` (`boolean \| null`), `display`, `options` (keys `true`, `false`), `set(key)`, `clear()` |
| `short-text`, `long-text` | `string`, `text` | `value`, `display`, `entry`, `entries`, `set(text)`, `setAt(index, text)`, `clear()` |
| `integer`, `decimal` | the same types | as above, `value` a number |
| `calendar-date`, `date-time` | `date`, `dateTime` | as above, `value` the FHIR string |
| `quantity` | `quantity` | as above, `value` a `Quantity`, plus `units` (the permitted units as options), `unit` (typed, when none are permitted), `setUnit(keyOrText)` |
| `single-choice`, `single-list`, `single-menu` | `choice`, `open-choice` without `repeats` | `value` (`Answer \| null`), `display`, `options`, `optionState`, `optionMessage`, `retry()`, `other`, `setOther(text)`, `set(key)`, `clear()` |
| `multi-choice`, `multi-list` | the same with `repeats` | as above, `value` a list, `set(keys)`, `toggle(key)` |
| `calculated` | an item with a `calculatedExpression` | `value`, `display` (the catalogue's `scoreUnavailable` while there is none) |
| `statement` | `display` | — |
| `group`, `repeating-group` | `group` | `children`; or `instances`, `canAdd`, `reason`, `addLabel`, `add()` |
| `unsupported` | a lenient-mode placeholder (AC-01.3.2) | `notice` |

**Control choice (INV-P-05).** `itemControl` `check-box` is honoured on a choice that repeats, and `radio-button` and `drop-down` on one that does not. Any other hint, or one that does not fit, falls back silently to the count rule: up to 5 options are all shown (`*-choice`), more are a list (`*-list`). A value set's options count once resolved.

**Entry controls take text (INV-P-06, M5 plan D3).** `set(text)` gets the text as typed, in FHIR's form: `2024`, `2024-05`, `2024-05-01`, `2024-05-01T14:30`, `0.50`. There is no locale parsing (NFR-I-04). Text that is a value becomes the answer. Text that is not stays as `entry`, clears the answer, and raises `not-a-date` or `not-a-number` once the item is left or a completion is refused. So the response never holds a value the screen does not show. The view keeps drafts while they match the answers; a change from elsewhere wins. A repeating question has `entries`: one per answer and an empty one while another is allowed (AC-03.3.1). `display` is the value formatted for reading (ADR-0020). A decimal keeps the scale it was typed at while its draft lasts (ADR-0020 amendment).

**Options take keys.** An option's `key` is a string, so it can be a DOM value as it is; `set`, `toggle` and `setUnit` take keys (ADR-0013 amendment note). An answer that matches no option is kept as a selected option of its own (T8). On `open-choice`, `other` is the free text: on a single choice it replaces the selected option, and the reverse (T10).

**Repeats (INV-P-04).** `canAdd` is `false` at `maxOccurs`; the add control stays, inert, with `reason`. `remove` is never refused.

**Issue text (AC-04.2.1).** Each built-in rule has its own default message, filled with the formatted limit and the value entered: "Enter 1,000 or more. You entered 12."

**The error summary (AC-11.3.1).** After a refused completion, and while any issue is still surfaced, it lists the issues in `SessionState.issues` order: form-level ones first, with `focusId: null`, then document order and position. Each entry links to the node's control. A group's entry links to its label, and a repeating group's to its add control while it can add. `focusTarget` then names the summary.

**Announcements (INV-P-03, AC-11.3.2).** At most one per cycle, naming what changed and how many: questions shown or hidden (groups are not counted), sections added or removed, answers needing attention, a refused or a finished completion. An option set settling is announced on its own (T12). `cycle` tells a repeat from a re-render. A view announces nothing and targets nothing on its first model.

**Focus targets.** After a refused completion: the summary. After an add: the new instance's first control (AC-03.2.1). After a removal: the first control of the instance that took its place, else of the one before, else the add control (M5 plan D12).

### 5.3 The tier-3 contract (ADR-0013)

`ControlView<K>` is the node of one kind. `ControlProps<K>` is what a host's replacement control receives: `node`, `ids`, `set`, `clear` and `leave`. The replacement renders the control only. It puts `ids.control` on its focusable element, `aria-describedby` on `ids.description` and `ids.error` while they hold text, and `aria-invalid` from `node.invalid`, and it calls `leave()` when focus leaves. The kit renders the label, help, error text and required marker around it.

### 5.4 Messages

**Messages (M4, US-07.4, ADR-0020).** `options.messages` overrides the built-in `en` catalogue key by key. A key the host leaves out, or gives as blank text or in the wrong shape (a plural needs both `one` and `other`), falls back to the default, so no string is ever empty or a raw key (INV-X-08). An issue's own message key is looked up first. For a built-in rule that key is its code, so `'max-length': 'At most {limit}'` rewords one rule. For a cross-field rule it is the rule's key; a key with no text falls back to the generic message. The catalogue has 38 keys of NFR-I-02's 45, each documented with its context in `view/messages/en.ts`.

**What the report leaves unexported.** The view's report names four types it reaches from `@fhirq/core`: `Session`, `IssueCode`, `Answer` and `Quantity`. API Extractor does not follow a package's own entry points into each other, and the resume report shows the same for its types. A host imports them from `@fhirq/core`. No internal type is left unexported.

## 6. Not in the API yet

- **US-07.3's `Should`:** scheduling an evaluator from the inputs an expression declares. Calculated values are re-run on every cycle that changed answers or enablement.
- **Checking a coded answer against the resolved options.** It is not required by any M4 criterion, and a resumed code must load whatever the set holds (T8).
- **M6–M8:** the React hook and default UI, the custom element's attributes and events, and the theme tokens.
- **Help text** (M5 plan D5): R4 carries it as a `display` item nested under a question, which the kit rejects (INV-D-17), so `description` is always `null`.
- **A draft blocking completion.** Text that is not a value yet on an optional item does not stop `RequestCompletion`: the response simply omits it. The view shows its issue after a refused completion, but nothing refuses one for it (M5 close-out, follow-up).
