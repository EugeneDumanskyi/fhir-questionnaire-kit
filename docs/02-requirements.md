# FHIR Questionnaire Kit — Requirements

*Phase: business analysis. Input: `01-brief.md`. Output: epics, user stories, acceptance criteria. Next: architecture → milestones → build.*

*Revised after domain modelling: the decisions in `04-domain.md` §9 are folded into the acceptance criteria below and indexed in §19. Revised after architecture: tensions AT1–AT4 from `05-architecture.md` §9 are folded in and indexed in §20.*

---

## 0. How to read this document

**Actors.** Requirements are written from the points of view below. All of them must be satisfied by the same release.

| Actor | Who | Source |
|---|---|---|
| **INT** — Integrator | Engineer on a regulated clinical software team wiring the library into a host app | Brief §3 primary user |
| **EMB** — Embedder | Engineer on a non-JavaScript shop (Rails/Django/.NET/CMS) dropping a form into a page | Brief §3 secondary user |
| **RES** — Respondent | The patient or clinician actually answering the form | Implied by §6.4 |
| **EVL** — Technical evaluator | Architect or senior engineer on an adopting team doing due diligence, 15–40 min, reads code, tests and ADRs | Brief §2 |
| **STK** — Scanning stakeholder | Product owner, clinical lead or engineering manager shortlisting options, 30 s–3 min, often on a phone, does not read code | Brief §2 |
| **MNT** — Maintainer | Whoever maintains the project: cuts releases, curates fixtures, reviews ADRs and docs | Brief §1 |

**Priority.** MoSCoW. `Must` = the release is not shippable without it, because without it an adopting team cannot evaluate, integrate or trust the release. `Should` = ships unless the time constraint bites. `Could` = cosmetic polish after the initial release. There is deliberately no `Won't` list here — that lives in the conformance matrix (§16).

**Traceability.** Every epic names the design principle from Brief §6 it serves. An epic tracing to none of them is a cut candidate.

**Assumptions.** Anything the brief did not fix is marked `ASSUMPTION:` inline and collected in §17. Numbers live in `03-nfr.md`; this document references NFR IDs rather than restating figures.

**Vocabulary.**
- *Item* — one entry in `Questionnaire.item`, of any type including `group`.
- *Enabled / disabled* — the `enableWhen` computed state of an item.
- *Engine state* — the complete internal model, including answers to currently-disabled items.
- *Emitted response* — the `QuestionnaireResponse` produced for the host, which excludes disabled items.
- *Host* — the application embedding the library. Owns transport, auth, storage, tenancy.
- *Repeat ordinal* — the permanent number of one instance of a repeating group. Never reused within a session, even after removal. Distinct from the instance's *position*, which is its current order and changes when an earlier instance is removed.
- *Visible view* — engine state restricted to enabled items. Emission, validation, scoring, cross-field rules and `enableWhen` conditions all read this view; only the state snapshot reads retained answers.
- *Diagnostic* — a finding about the questionnaire, a stored response or the integration, for the integrator. Never carries answer values. Distinct from a *validation issue*, which is about RES's answers.

---

## 1. Epic map

| ID | Epic | Principle served (§6) | Priority |
|---|---|---|---|
| E01 | Questionnaire ingestion and item type coverage | 3, 4 | Must |
| E02 | Conditional logic (`enableWhen`) | 3, 4 | Must |
| E03 | Structure: nested and repeating groups | 3 | Must |
| E04 | Validation | 4 | Must |
| E05 | Response emission and answer retention | 1, 4 | Must |
| E06 | Save and resume | 4 | Must |
| E07 | Extension points and injected collaborators | 2 | Must |
| E08 | React adapter | 3 | Must |
| E09 | Web component (`<fhir-questionnaire>`) | 2, 3 | Must |
| E10 | Customization tiers | 2 | Must |
| E11 | Accessibility | 4 | Must |
| E12 | Playground | STK | Must |
| E13 | Documentation, ADRs, conformance matrix | 1, 2 | Must |
| E14 | Packaging, supply chain, CI, release | 1, 2 | Must |
| E15 | Demo questionnaire fixture | STK, 4 | Must |

---

## 2. E01 — Questionnaire ingestion and item type coverage

**Goal.** A host hands the library a FHIR R4 `Questionnaire` resource and gets a correct, complete, rendered form — or a precise, actionable failure. Nothing silently half-renders.

#### US-01.1 — Load a Questionnaire resource
**As** INT, **I want** to pass a parsed `Questionnaire` object to the engine, **so that** I control fetching, auth and caching myself.
**Priority:** Must

- **AC-01.1.1 — Object in, session out**
  **Given** a structurally valid FHIR R4 `Questionnaire` object
  **When** the host creates an engine session from it
  **Then** a session is returned synchronously with every item resolved to an initial enabled/disabled state, and no network request is made at any point.
- **AC-01.1.2 — No implicit fetching**
  **Given** a `Questionnaire` whose items reference an external `ValueSet` by canonical URL
  **When** the session is created without a resolver configured
  **Then** the session is still created, the affected items report an `unresolved-options` condition, and no HTTP request is attempted.
- **AC-01.1.3 — Structural rejection is precise**
  **Given** a document that is not a `Questionnaire`, is not R4, or contains duplicate `linkId` values
  **When** the host creates a session
  **Then** creation fails with a typed error naming the rule violated and the `linkId` path at fault, and the error message contains no answer data.
- **AC-01.1.4 — Questionnaire is fixed for the session**
  **Given** a session exists
  **When** the host needs to render a different or edited questionnaire
  **Then** it creates a new session — the engine offers no way to swap the questionnaire inside an existing one — and answers are carried across only by emitting a response and resuming from it (US-06.1), with the diagnostics that brings.

#### US-01.2 — Render the supported item types
**As** RES, **I want** each question to use the input control its data type implies, **so that** I can answer without guessing the expected format.
**Priority:** Must

- **AC-01.2.1 — Type coverage**
  **Given** a questionnaire containing `boolean`, `decimal`, `integer`, `date`, `dateTime`, `string`, `text`, `choice`, `open-choice`, `quantity`, `display` and `group` items
  **When** the form renders
  **Then** every item renders with a control appropriate to its type, and the conformance matrix marks each of these types supported.
- **AC-01.2.2 — Choice presentation follows the authored hint**
  **Given** a `choice` item carrying an `itemControl` hint of radio-button, drop-down or check-box **ASSUMPTION: only these three `itemControl` codes are honoured; all others fall back to the count rule below**
  **When** the item renders
  **Then** the hinted control is used; and where no hint is present, ≤ 5 options render as radios and > 5 as a listbox **ASSUMPTION: threshold of 5**.
- **AC-01.2.3 — Open-choice accepts free text**
  **Given** an `open-choice` item
  **When** RES selects the "other" affordance and types a value
  **Then** the answer is the free-text string rather than a coded value; an `open-choice` answer is always one or the other, so switching to a coded option replaces the free text in engine state as well as in the emitted response. Answer retention (US-05.2) applies to hidden items, not to RES changing their mind.
- **AC-01.2.4 — Quantity carries a unit**
  **Given** a `quantity` item with permitted units supplied by the questionnaire
  **When** RES enters a numeric value and selects a unit
  **Then** the emitted answer is a `Quantity` with `value`, `unit`, `system` and `code` populated, and a value entered with no unit selected fails validation.

#### US-01.3 — Fail loudly on unsupported constructs
**As** INT, **I want** unsupported spec features to be visible at load time, **so that** I do not discover a gap in production.
**Priority:** Must

- **AC-01.3.1 — Unsupported type is reported, not skipped**
  **Given** a questionnaire containing an item type outside the supported set (for example `attachment`, `reference`, `url`, `time`)
  **When** the session is created in the default `strict` mode
  **Then** session creation fails with an error listing each unsupported `linkId` and its type.
- **AC-01.3.2 — Lenient mode is opt-in and visible**
  **Given** the host explicitly opts into `lenient` mode
  **When** the same questionnaire is loaded
  **Then** the session is created, unsupported items render as a non-interactive "unsupported item" placeholder, the item is excluded from validation and from the emitted response, and the session exposes the same diagnostics list.
- **AC-01.3.3 — Expression extensions are never silently ignored**
  **Given** a questionnaire carrying an SDC expression extension other than `calculatedExpression` (which routes through the evaluator seam, AC-07.3.1)
  **When** the session is created
  **Then** the extension is treated as an unsupported construct as shown below, and never ignored. Every error and diagnostic names the extension and the `linkId` path, and the conformance matrix lists each extension as `not supported`.

  | Extension | `strict` | `lenient` |
  |---|---|---|
  | `enableWhenExpression` | Creation fails | The item is disabled, with a diagnostic. This is the fail-safe direction: a question the author meant to gate is hidden rather than shown. Its descendants are disabled, and conditions treat it as unanswered (AC-02.2.4). |
  | `answerExpression`, `candidateExpression` | Creation fails | The item has no options, as with `unresolved-options`, with a diagnostic |
  | `initialExpression` | Creation fails | The extension is ignored and the item starts empty, with a diagnostic |
  | `variable`, `launchContext` and other context-only extensions | Diagnostic only | Diagnostic only |

#### US-01.4 — Authored text is rendered safely
**As** INT, **I want** questionnaire-authored text never to become executable markup, **so that** an untrusted questionnaire source cannot mount an XSS attack on my app.
**Priority:** Must

- **AC-01.4.1 — Text is text**
  **Given** an item whose `text` contains HTML or script markup
  **When** the form renders
  **Then** the markup is displayed as literal text and no element or script from it enters the DOM.
- **AC-01.4.2 — Rich text requires host consent**
  **Given** an item carrying a `rendering-xhtml` extension
  **When** the host has not supplied a sanitizer
  **Then** the plain `text` value is rendered instead and a diagnostic is raised; and **when** the host supplies a sanitizer function, the extension content is passed through it before rendering and never rendered unsanitized.

---

## 3. E02 — Conditional logic (`enableWhen`)

**Goal.** The rules engine that is the actual product. Correct, cascading, cycle-safe, and observable.

#### US-02.1 — Single-condition visibility
**As** RES, **I want** questions that do not apply to me to disappear, **so that** I am not asked irrelevant clinical questions.
**Priority:** Must

- **AC-02.1.1 — Condition satisfied**
  **Given** item B declares `enableWhen` on item A with operator `=` and a given answer
  **When** RES gives A that answer
  **Then** B becomes enabled within the same update cycle and is announced to assistive technology per AC-11.3.2.
- **AC-02.1.2 — Condition unsatisfied at load**
  **Given** the same questionnaire with no answer to A
  **When** the session is created
  **Then** B is disabled, is absent from the emitted response, and is not counted by required-field validation.
- **AC-02.1.3 — Operator coverage**
  **Given** conditions using `exists`, `=`, `!=`, `>`, `<`, `>=`, `<=`
  **When** each is evaluated against every supported answer type
  **Then** the result matches the FHIR R4 comparison rules for that type, and each operator/type pair has a named test in the conformance matrix.

#### US-02.2 — Cascading chains
**As** INT, **I want** dependent chains to settle correctly in one pass, **so that** the UI never shows a transiently wrong state.
**Priority:** Must

- **AC-02.2.1 — Chain collapse**
  **Given** C depends on B and B depends on A, with all three currently enabled
  **When** RES changes A so that B becomes disabled
  **Then** C is disabled in the same evaluation cycle, and exactly one state-change notification is emitted to the host.
- **AC-02.2.2 — Deterministic order**
  **Given** a chain of dependencies of the depth defined in NFR-P-05
  **When** evaluation runs
  **Then** the final state is identical regardless of item declaration order in the source document.
- **AC-02.2.3 — Only affected items recompute**
  **Given** a questionnaire at the scale ceiling in NFR-P-04
  **When** one answer changes
  **Then** only items transitively dependent on the changed item are re-evaluated, evidenced by an instrumented test asserting the recomputed set.
- **AC-02.2.4 — Hidden answers do not drive conditions**
  **Given** C's `enableWhen` tests B's answer, and B is disabled while holding a retained answer
  **When** evaluation runs
  **Then** every condition treats B as unanswered, matching R4's guidance for disabled questions — which is what makes the chain collapse in AC-02.2.1 hold under the default `retain-exclude` policy.

#### US-02.3 — `enableBehavior`
**As** INT, **I want** `any` and `all` to be honoured, **so that** instruments authored elsewhere behave the same here.
**Priority:** Must

- **AC-02.3.1 — `all`**
  **Given** an item with two conditions and `enableBehavior = all`
  **When** exactly one condition holds
  **Then** the item remains disabled.
- **AC-02.3.2 — `any`**
  **Given** the same item with `enableBehavior = any`
  **When** exactly one condition holds
  **Then** the item is enabled.
- **AC-02.3.3 — Missing `enableBehavior`**
  **Given** an item with more than one condition and no `enableBehavior`, which R4 does not allow (it defines no default: rule que-12 requires a value)
  **When** the session is created
  **Then** creation fails in `strict` mode naming the `linkId` path and, in `lenient` mode, `all` is applied with a diagnostic; the conformance matrix states both. *(Amended 2026-09-17: this criterion said `all` was the R4 default. `06-roadmap.md` M2 D1.)*

#### US-02.4 — Conditions on groups
**As** RES, **I want** a whole section to disappear at once, **so that** the form does not leave orphaned sub-questions behind.
**Priority:** Must

- **AC-02.4.1 — Subtree follows the group**
  **Given** a `group` item with `enableWhen`, containing nested items that are individually enabled
  **When** the group becomes disabled
  **Then** every descendant is treated as disabled, excluded from validation, and excluded from the emitted response regardless of its own condition.
- **AC-02.4.2 — Re-enable restores descendant logic**
  **Given** the group later becomes enabled again
  **When** evaluation runs
  **Then** each descendant's own `enableWhen` is re-applied rather than all descendants being blanket-enabled.

#### US-02.5 — Malformed and circular conditions
**As** INT, **I want** bad logic caught at load, **so that** a broken questionnaire cannot hang the browser.
**Priority:** Must

- **AC-02.5.1 — Cycle detection**
  **Given** a questionnaire where A depends on B and B depends on A
  **When** the session is created
  **Then** creation fails with an error naming every `linkId` in the cycle, and no evaluation is attempted.
- **AC-02.5.2 — Dangling reference**
  **Given** a condition referencing a `linkId` that does not exist
  **When** the session is created
  **Then** creation fails in `strict` mode and, in `lenient` mode, the condition evaluates to false with a diagnostic raised.
- **AC-02.5.3 — Type-mismatched comparison**
  **Given** a condition comparing a string answer with `>`
  **When** the session is created
  **Then** the mismatch is reported as a load-time diagnostic rather than a runtime exception.
- **AC-02.5.4 — Conditions and repeating groups**
  **Given** a condition whose question item sits inside a repeating group
  **When** the session is created
  **Then** if the dependent item is inside the same repeating group, the condition resolves within the same instance (AC-03.2.3); if the dependent item is outside that group, creation fails in `strict` mode naming both `linkId`s and, in `lenient` mode, the condition evaluates to false with a diagnostic. The engine never guesses "any instance" or "first instance". R4 does resolve the outside case, by document position (the nearest occurrence along the ancestor, then preceding, then following axis); the kit does not implement that rule, and the conformance matrix lists it as `not supported` for that reason.
- **AC-02.5.5 — Conditions on calculated items**
  **Given** a condition whose question item takes its value from the expression seam (AC-07.3.3)
  **When** the session is created
  **Then** creation fails in `strict` mode naming both `linkId`s — the evaluator's inputs are invisible to the dependency graph, so the cycle check in AC-02.5.1 cannot be proven — and, in `lenient` mode, the condition evaluates to false with a diagnostic. The conformance matrix lists this as `not supported`.

---

## 4. E03 — Structure: nested and repeating groups

#### US-03.1 — Arbitrary nesting
**As** INT, **I want** groups to nest to the depth my instrument uses, **so that** I do not have to flatten authored content.
**Priority:** Must

- **AC-03.1.1 — Depth**
  **Given** a questionnaire nested to the depth in NFR-P-05
  **When** it renders
  **Then** hierarchy is preserved in the DOM, in the accessibility tree per AC-11.2.1, and in the emitted response's nested `item` arrays.

#### US-03.2 — Repeating groups
**As** RES, **I want** to add and remove instances of a repeated section, **so that** I can record two medications or three previous episodes.
**Priority:** Must

- **AC-03.2.1 — Add**
  **Given** a `group` item with `repeats = true`
  **When** RES activates the add control
  **Then** a new empty instance appears, focus moves to its first focusable control, and the addition is announced per AC-11.3.2.
- **AC-03.2.2 — Remove**
  **Given** three instances exist and RES removes the second
  **When** the emitted response is produced
  **Then** it contains exactly the first and third instances' answers, in their original relative order; the third instance keeps its repeat ordinal while its position changes, and the removed instance's ordinal is never reused by a later addition.
- **AC-03.2.3 — Independent conditional state**
  **Given** a repeating group whose child items carry `enableWhen` referencing siblings inside the same group
  **When** RES answers the trigger in instance 2
  **Then** only instance 2's dependent items change state — instances 1 and 3 are untouched.
- **AC-03.2.4 — Cardinality bounds**
  **Given** a repeating group with minimum and maximum occurrence extensions **ASSUMPTION: `questionnaire-minOccurs` / `questionnaire-maxOccurs` are the supported mechanism**
  **When** RES reaches the maximum
  **Then** the add control is disabled with an explanatory message, and falling below the minimum raises a validation error rather than blocking removal.
- **AC-03.2.5 — Default instance count**
  **Given** a repeating group with no answers on load
  **When** the form renders
  **Then** one empty instance is shown **ASSUMPTION: one, not zero — zero requires RES to discover the add control before seeing any content**.
- **AC-03.2.6 — Removal is permanent**
  **Given** RES removes an instance that holds answers
  **When** the removal completes
  **Then** that instance's answers are destroyed and the engine cannot restore them; answer retention applies to hidden items, not removed instances. The UI may ask for confirmation before removing.
- **AC-03.2.7 — Stored data above the maximum**
  **Given** a resumed response or restored snapshot with more instances of a repeating group than its maximum allows (for example after a questionnaire edit lowered the maximum)
  **When** the session is created
  **Then** every instance is loaded, the add control is disabled, and a validation error is raised on the group — no instance is dropped automatically, and removal still works.

#### US-03.3 — Repeating non-group items
**As** RES, **I want** to give more than one answer to a single question, **so that** multi-select and multi-value questions work.
**Priority:** Must

- **AC-03.3.1 — Multiple answers**
  **Given** a non-group item with `repeats = true`
  **When** RES supplies two values
  **Then** the emitted item carries two entries in its `answer` array.

#### US-03.4 — Addressing items unambiguously
**As** INT, **I want** a stable path for any item instance, **so that** my validation rules and analytics can target a specific repeat.
**Priority:** Should

- **AC-03.4.1 — Stable path**
  **Given** an item inside the second instance of a repeating group
  **When** the host inspects engine state
  **Then** the item exposes a path combining `linkId` values and repeat ordinals (not positions), which stays the same when other instances are added or removed and is reused verbatim in validation callbacks and change events.

---

## 5. E04 — Validation

#### US-04.1 — Required answers
**As** INT, **I want** required items enforced, **so that** I do not submit an incomplete clinical record.
**Priority:** Must

- **AC-04.1.1 — Block completion**
  **Given** an enabled item with `required = true` and no answer
  **When** the host requests completion
  **Then** completion is refused, the item is reported as invalid with a localized message whether or not its error had been shown yet, and the response is not marked `completed`.
- **AC-04.1.2 — Disabled items are exempt**
  **Given** a required item that is currently disabled
  **When** the host requests completion
  **Then** the item is not reported as invalid and completion proceeds.

#### US-04.2 — Constraint validation
**As** RES, **I want** to be told immediately when a value is out of range, **so that** I can correct it in context.
**Priority:** Must

- **AC-04.2.1 — Range and length**
  **Given** items carrying `maxLength`, `minValue`, `maxValue` and `maxDecimalPlaces`
  **When** RES enters a violating value
  **Then** an error is attached to that item naming the limit and the entered value, and the value is retained in the field rather than discarded.
- **AC-04.2.2 — Date validity**
  **Given** a `date` or `dateTime` item
  **When** RES enters a syntactically invalid or out-of-range value
  **Then** validation fails with a message distinguishing "not a date" from "outside the permitted range".
- **AC-04.2.3 — Validation timing**
  **Given** default configuration
  **When** RES types into a field
  **Then** errors surface on blur and on completion attempt, never on every keystroke, and once an item has shown an error it re-validates on each change so the error clears as soon as the value is valid **ASSUMPTION: blur-then-live is the default; configurable per NFR-U-03**.
- **AC-04.2.4 — Shown errors stay live**
  **Given** an item has shown an error
  **When** the value is corrected, or the item is hidden and later shown again
  **Then** the item stays in live re-validation mode: correcting it does not return it to blur-only timing, and hiding it does not reset what RES has already been told.

#### US-04.3 — Cross-field validation
**As** INT, **I want** to register rules spanning several items, **so that** I can express clinical constraints the spec cannot.
**Priority:** Must

- **AC-04.3.1 — Register a rule**
  **Given** the host registers a rule over two item paths returning a message or null
  **When** either item changes
  **Then** the rule runs and its message is attached to the item paths it names, or to form level where it names none.
- **AC-04.3.2 — Rules are pure and synchronous**
  **Given** a registered rule
  **When** it is invoked
  **Then** it receives a read-only snapshot of engine state, cannot mutate it, and a rule that throws is caught, reported as a diagnostic, and does not break form interaction.
- **AC-04.3.3 — Rules skip disabled items**
  **Given** a cross-field rule referencing an item that is currently disabled
  **When** evaluation runs
  **Then** the rule is skipped, not run against a stale answer.
- **AC-04.3.4 — When cross-field errors appear**
  **Given** a cross-field rule returns a message
  **When** the rule names item paths
  **Then** the error appears on each named item according to that item's own timing (AC-04.2.3, AC-04.2.4); **and when** it names none, the form-level error appears only when completion is attempted.

#### US-04.4 — Validation as data
**As** INT, **I want** the full validation result as a structure, **so that** I can render errors in my own design system.
**Priority:** Must

- **AC-04.4.1 — Serializable result**
  **Given** a form with three errors
  **When** the host reads the validation result
  **Then** it receives a serializable list of `{ path, linkId, code, message, severity }`, ordered by document order, with `severity` distinguishing `error` from `warning`.

---

## 6. E05 — Response emission and answer retention

**This epic carries the brief's key product decision (§5) and is the behaviour adopters most need to understand before trusting emitted responses.**

#### US-05.1 — Emit a conforming QuestionnaireResponse
**As** INT, **I want** a valid R4 `QuestionnaireResponse`, **so that** I can persist it to my own FHIR server unchanged.
**Priority:** Must

- **AC-05.1.1 — Shape**
  **Given** a partially answered form
  **When** the host requests the response
  **Then** it receives a `QuestionnaireResponse` with `questionnaire` canonical reference, `status`, `authored`, and a nested `item` tree mirroring the questionnaire's structure for enabled, answered items only.
- **AC-05.1.2 — Host owns identity**
  **Given** the host supplies `subject`, `author`, `encounter` or `identifier` values
  **When** the response is emitted
  **Then** those values appear verbatim; **and when** they are not supplied, the fields are omitted — the library never invents, infers or defaults a patient identity.
- **AC-05.1.3 — Status lifecycle**
  **Given** a session in progress
  **When** the response is emitted
  **Then** `status` is `in-progress`; it becomes `completed` only after validation passes and the host explicitly completes the session.
- **AC-05.1.4 — Completed is final**
  **Given** a session with status `completed`
  **When** the host or RES tries to change an answer or add or remove a repeat instance
  **Then** the change is refused; editing a completed response means creating a new session from it (US-06.1). FHIR's `amended` status is not supported and is listed in the conformance matrix.

#### US-05.2 — Retain internally, exclude from emission
**As** RES, **I want** answers to come back if I re-enable a question, **so that** I do not retype work lost to a mis-click.
**Priority:** Must

- **AC-05.2.1 — Restore on re-enable**
  **Given** RES answered item B, then changed item A so that B became disabled
  **When** RES changes A back so B is enabled again
  **Then** B shows its previous answer.
- **AC-05.2.2 — Excluded while disabled**
  **Given** the same state with B disabled
  **When** the response is emitted
  **Then** B is absent entirely — not present with a null answer — so a downstream scorer cannot count an item the patient was never shown.
- **AC-05.2.3 — Policy is configurable**
  **Given** the host sets the retention policy to `discard`
  **When** B becomes disabled
  **Then** B's answer is erased from engine state immediately and is not restored on re-enable.
- **AC-05.2.4 — Default is documented and defensible**
  **Given** an integrator reads the repository
  **When** they open the ADR index
  **Then** an ADR states `retain-exclude` as the default, argues it from patient-safety and data-loss first principles, names the discarded alternatives, and cites no unverifiable behaviour of other systems.
- **AC-05.2.5 — Hidden answers cannot be edited**
  **Given** item B is disabled and holds a retained answer
  **When** any caller — default UI, slot component or headless host — tries to set or clear B's answer
  **Then** the command is refused with a reason and B's retained answer is unchanged. A hidden answer can be restored, never edited while hidden.
- **AC-05.2.6 — `discard` resets hidden repeating groups**
  **Given** the retention policy is `discard` and a repeating group with several instances becomes disabled
  **When** the change settles
  **Then** the group is reset to one empty instance in the same evaluation cycle.

#### US-05.3 — Engine state is separable from the emitted document
**As** EVL, **I want** to see that internal state and the FHIR document are distinct models, **so that** I can trust that a hidden answer cannot leak into the clinical record through the layering.
**Priority:** Must

- **AC-05.3.1 — Full-fidelity snapshot**
  **Given** a session with retained answers on disabled items
  **When** the host serializes engine state
  **Then** the snapshot contains the retained answers, is JSON-serializable, and restoring from it reproduces the exact session including retained answers, repeat ordinals and positions, error display state and status.
- **AC-05.3.2 — Two outputs, one source**
  **Given** the same session
  **When** both the state snapshot and the `QuestionnaireResponse` are produced
  **Then** they are different shapes produced by distinct code paths, with no field of the emitted response derived from disabled-item state.
- **AC-05.3.3 — Snapshots are not a migration format**
  **Given** a snapshot taken against one questionnaire
  **When** the host restores it against a questionnaire with a different canonical URL or version
  **Then** restore fails with a typed error naming both, and the host must resume from an emitted response instead (US-06.1, US-06.3). Option lists are not part of the snapshot and are resolved again on restore (AC-07.1.1).

---

## 7. E06 — Save and resume

#### US-06.1 — Resume from a stored response
**As** RES, **I want** to return to a long form where I left it, **so that** I do not restart a 60-item instrument.
**Priority:** Must

- **AC-06.1.1 — Hydration**
  **Given** a previously emitted `QuestionnaireResponse` and its `Questionnaire`
  **When** the host creates a session from both
  **Then** every answer is populated, `enableWhen` is evaluated against those answers so dependent items are correctly enabled, and repeat instances are reconstructed at their original counts.
- **AC-06.1.2 — Resume is lossless for enabled items**
  **Given** a session hydrated from a response and immediately re-emitted with no edits
  **When** the two responses are compared ignoring `authored` and `status` (see AC-06.1.4)
  **Then** they are semantically identical.
- **AC-06.1.3 — Unknown answers are reported**
  **Given** a response containing a `linkId` not present in the questionnaire
  **When** hydration runs
  **Then** hydration succeeds, the orphan is reported as a diagnostic, and the orphan is not silently carried into the next emitted response.
- **AC-06.1.4 — Resumed sessions start in progress**
  **Given** a stored response with any status, including `completed`
  **When** a session is created from it
  **Then** the session's status is `in-progress`.
- **AC-06.1.5 — Answers to hidden items are dropped on resume**
  **Given** a stored response containing an answer to an item that is disabled once all stored answers are evaluated (for example after a questionnaire edit)
  **When** hydration runs
  **Then** that answer is neither loaded nor retained, and a `hydrated-answer-disabled` diagnostic names its path — so an answer of unknown provenance cannot reappear later without RES entering it.

#### US-06.2 — Host-driven autosave
**As** INT, **I want** a change signal, **so that** I can implement autosave on my own schedule and transport.
**Priority:** Must

- **AC-06.2.1 — Change events**
  **Given** a subscribed host
  **When** an answer, validity or enablement state changes
  **Then** one event is emitted per user-visible change, carrying the changed paths and a flag for whether the emitted response would differ — and the library itself performs no persistence, no timers, and no network activity. A change with no user action behind it, such as an option resolver settling, is a change in its own right and emits its own event.

#### US-06.3 — Questionnaire version drift
**As** INT, **I want** resume against a changed questionnaire to be explicit, **so that** a form edit cannot silently corrupt a clinical record.
**Priority:** Should

- **AC-06.3.1 — Version mismatch is surfaced**
  **Given** a stored response whose `questionnaire` canonical includes a version differing from the loaded questionnaire
  **When** hydration runs
  **Then** a `version-drift` diagnostic is raised naming both versions, and the host may proceed or abort — the library does not decide.
- **AC-06.3.2 — Type-incompatible answers are quarantined**
  **Given** an item whose type changed between versions
  **When** hydration runs
  **Then** the incompatible answer is not loaded into the field, a diagnostic names its path with the expected and found type but not the value (NFR-X-04; the host still holds the original response), and it does not appear in a subsequently emitted response.
- **AC-06.3.3 — Too many answers for a single-answer item**
  **Given** a stored response with more than one answer for an item that does not repeat
  **When** hydration runs
  **Then** none of those answers is loaded and the item is reported as in AC-06.3.2 — the engine does not pick one silently.

---

## 8. E07 — Extension points and injected collaborators

**This epic is the evidence for Principle 2 — designing for constraints the library does not control.**

#### US-07.1 — Option resolver injection
**As** INT, **I want** to supply my own function for resolving `ValueSet` references, **so that** my auth, retries, caching and offline behaviour are preserved.
**Priority:** Must

- **AC-07.1.1 — Injection**
  **Given** the host supplies an async resolver mapping a canonical URL to a list of coded options
  **When** an item references that `ValueSet`
  **Then** every referenced URL is resolved when the session starts rather than when an item first becomes visible, so the pattern of resolver calls cannot reveal which branch of the form RES took; the resolver is called at most once per distinct URL per session except for an explicit retry (AC-07.1.2); the item shows a pending state and accepts no coded answer until its options arrive, though free text on `open-choice` is still accepted; and the rest of the form remains fully interactive meanwhile.
- **AC-07.1.2 — Failure is the host's shape**
  **Given** the resolver rejects
  **When** the item renders
  **Then** the item shows a retry affordance, the error is exposed to the host verbatim, and the library neither retries nor logs on its own.
- **AC-07.1.3 — Default resolver for the embed case**
  **Given** EMB uses the web component with a `value-set-base` attribute and no injected resolver
  **When** an item references a `ValueSet`
  **Then** a documented default resolver performs a plain `GET` against that base — and this resolver lives in `@fhirq/element` only, never in `@fhirq/core`, which must remain incapable of network access per AC-14.6.1.
- **AC-07.1.4 — Resumed coded answers survive slow or failed lookups**
  **Given** a session resumed from a response with coded answers to a `ValueSet`-bound item
  **When** the options are still pending, have failed, or no resolver is configured
  **Then** the coded answers are loaded and are not marked invalid merely because the options are unknown.

#### US-07.2 — Scoring as an extension point
**As** INT, **I want** to compute a score from the form state, **so that** I can show a PHQ-9 total without the engine owning clinical logic.
**Priority:** Must

- **AC-07.2.1 — Registration**
  **Given** the host registers a scoring function over a read-only state snapshot
  **When** any contributing answer changes
  **Then** the function is re-invoked and its result is exposed to the UI layer for display, without the engine interpreting the meaning of the value.
- **AC-07.2.2 — Disabled items excluded**
  **Given** a scored item that is currently disabled
  **When** the scoring snapshot is built
  **Then** the disabled item's retained answer is not present in it, matching emission semantics.
- **AC-07.2.3 — Worked example ships**
  **Given** an integrator opens the documentation
  **When** they look for scoring
  **Then** a complete PHQ-9 and GAD-7 scoring implementation is shown as documented example code — **ASSUMPTION: shipped as a docs example and test fixture, not as a published package; publishing clinical scoring under the project's name invites a clinical-accuracy support obligation that Brief §1 lists as a failure condition**.
- **AC-07.2.4 — A failing scorer does not break the form**
  **Given** a registered scoring function that throws
  **When** it is invoked
  **Then** the error is reported as a diagnostic naming the scorer and the kind of failure but not the thrown message text (NFR-X-04), the original error is available to the host in memory, the previous score is cleared rather than left stale, and form interaction continues — the same handling as cross-field rules (AC-04.3.2).

#### US-07.3 — Expression evaluator seam
**As** EVL, **I want** to see where FHIRPath would attach, **so that** I know how to add expression support myself if my questionnaires need it.
**Priority:** Should

- **AC-07.3.1 — Named seam**
  **Given** FHIRPath is out of scope
  **When** an integrator reads the architecture docs
  **Then** an `ExpressionEvaluator` interface exists in the core types, items carrying a `calculatedExpression` extension route through it (other expression extensions are unsupported constructs, AC-01.3.3), and with no evaluator supplied they raise a diagnostic rather than failing the load.
- **AC-07.3.2 — Proven by a stub**
  **Given** a test-only evaluator implementing the interface
  **When** the test suite runs
  **Then** a test verifies that a calculated value flows through the seam, confirming the interface is sufficient and not decorative.
- **AC-07.3.3 — Calculated items are read-only**
  **Given** an item whose value comes from the expression seam
  **When** any caller tries to set its answer directly
  **Then** the command is refused; the evaluator is the only source of its value.
- **AC-07.3.4 — A failing evaluator does not break the form**
  **Given** a supplied expression evaluator that throws for an item
  **When** it is invoked
  **Then** that item's calculated value is cleared rather than left stale, a diagnostic names the item path and the kind of failure but not the thrown message text (NFR-X-04), the original error is available to the host in memory, and the evaluation cycle and form interaction continue — the same handling as scoring functions (AC-07.2.4).

#### US-07.4 — Message catalogue injection
**As** INT, **I want** to supply all user-facing strings, **so that** the form matches my product's language and tone.
**Priority:** Must

- **AC-07.4.1 — Full override**
  **Given** the host supplies a partial message catalogue
  **When** the form renders
  **Then** supplied keys are used and unsupplied keys fall back to the built-in English defaults, with no string hard-coded outside the catalogue (enforced by lint rule per NFR-M-06).

---

## 9. E08 — React adapter (`@fhirq/react`)

#### US-08.1 — Drop-in component
**As** INT, **I want** one component that renders a working form, **so that** my first integration takes minutes.
**Priority:** Must

- **AC-08.1.1 — Minimum viable integration**
  **Given** a questionnaire object
  **When** INT renders `<Questionnaire questionnaire={q} onChange={...} />`
  **Then** a complete, styled, accessible form appears with no other configuration, in the number of lines stated in NFR-U-01.
- **AC-08.1.2 — Controlled and uncontrolled**
  **Given** a host that supplies either a session or a response value, together with a change handler
  **When** it re-renders with a new value
  **Then** the form reflects it; **and given** no value is supplied, the component manages its own state and exposes it via the change handler. Supplying a session is the full-fidelity controlled mode: retained answers and error display state are always preserved.
- **AC-08.1.3 — Echoed responses leave the session untouched**
  **Given** a component controlled by a response value, whose host stores the response from the change handler and passes it back, either as the same object or as a copy (including a structured clone)
  **When** the component re-renders
  **Then** the existing session is kept: retained answers and error display state survive, no new session is created, and no diagnostic is raised. A value counts as an echo when it is the last emitted response, or is semantically equal to it ignoring `authored` and `status` (as in AC-06.1.2).
- **AC-08.1.4 — Replacing the response is explicit**
  **Given** the same component
  **When** the host passes a response whose content differs from the last emitted response
  **Then** the component resumes a new session from it (US-06.1) and raises a `controlled-value-replaced` diagnostic. The documentation states that this resets retained answers and error display state, and recommends session-controlled mode for hosts that edit responses outside the form.

#### US-08.2 — Headless hooks
**As** INT, **I want** engine state and actions without any markup, **so that** I can render entirely in my own design system.
**Priority:** Must

- **AC-08.2.1 — Hook surface**
  **Given** INT calls the headless hook with a questionnaire
  **When** they render nothing from the library
  **Then** they receive the item tree with enablement, answers, validation state, and answer/add/remove actions — sufficient to rebuild the default UI, proven by the default UI itself being implemented on top of the hook.

#### US-08.3 — SSR and hydration safety
**As** INT, **I want** server rendering to work, **so that** the library fits a Next.js app without a client-only escape hatch.
**Priority:** Must

- **AC-08.3.1 — No DOM at import**
  **Given** the React adapter is imported in a Node process with no DOM globals
  **When** the module is loaded and a form is rendered to a string
  **Then** it completes without error and produces markup reflecting initial enablement.
- **AC-08.3.2 — No hydration mismatch**
  **Given** server-rendered markup
  **When** the client hydrates
  **Then** React reports no hydration warning, verified by a test that fails the build on any console warning.

---

## 10. E09 — Web component (`@fhirq/element`)

#### US-09.1 — Script-tag embed
**As** EMB, **I want** to add a form to a Rails or Django page with a script tag, **so that** I do not introduce a JavaScript build step.
**Priority:** Must

- **AC-09.1.1 — No build step**
  **Given** a plain HTML page with one script tag pointing at the published bundle
  **When** EMB adds `<fhir-questionnaire src="...">`
  **Then** a working form renders, within the bundle budget in NFR-S-02, with no bundler, transpiler or framework present.
- **AC-09.1.2 — Data in, data out**
  **Given** the element
  **When** EMB sets a questionnaire via the `questionnaire` property or the `src` attribute and listens for the change and complete events
  **Then** events carry the `QuestionnaireResponse` as a plain object, and the element performs no persistence itself.

#### US-09.2 — Encapsulation and theming through it
**As** EMB, **I want** host page CSS not to break the form and vice versa, **so that** embedding is safe in a legacy stylesheet.
**Priority:** Must

- **AC-09.2.1 — Style isolation**
  **Given** a host page with aggressive global CSS (`* { box-sizing: content-box }`, global input styling)
  **When** the element renders in shadow DOM
  **Then** the form's layout and controls are unaffected, and no library style leaks into the host page.
- **AC-09.2.2 — Deliberate theming holes**
  **Given** EMB sets the documented CSS custom properties on the host element
  **When** the form renders
  **Then** the tokens apply through the shadow boundary, and the documented `::part` hooks allow targeted overrides.

#### US-09.3 — Framework-host neutrality
**As** EMB, **I want** the element to behave inside a server-rendered page lifecycle, **so that** it survives Turbo/HTMX-style partial swaps.
**Priority:** Should

- **AC-09.3.1 — Connect/disconnect hygiene**
  **Given** the element is removed and re-inserted into the DOM
  **When** it reconnects
  **Then** it re-renders from its current state with no duplicated event listeners and no detached-node leak, verified by a listener-count test.

---

## 11. E10 — Customization tiers

#### US-10.1 — Tier 1: usable defaults
**As** STK, **I want** the default rendering to look professional, **so that** I can judge in 30 seconds whether it could go in front of our patients without restyling.
**Priority:** Must

- **AC-10.1.1 — Zero-config quality**
  **Given** no theme, tokens or slots configured
  **When** the form renders on a 375 px viewport and a desktop viewport
  **Then** spacing, typography, focus and error states are complete and consistent, and the result meets every criterion in E11.

#### US-10.2 — Tier 2: design tokens
**As** INT, **I want** to match my design system by setting variables, **so that** adoption does not require a fork.
**Priority:** Must

- **AC-10.2.1 — Token coverage**
  **Given** the documented token set (colour, type scale, spacing, radius, border, focus ring)
  **When** INT overrides them
  **Then** every visual property of the default UI changes accordingly, with no hard-coded colour or spacing value remaining, verified by a test that renders with all tokens set to sentinel values and asserts no default value survives.

#### US-10.3 — Tier 3: slots and component overrides
**As** INT, **I want** to replace individual controls, **so that** I can use my own date picker while keeping the engine.
**Priority:** Must

- **AC-10.3.1 — Per-type override**
  **Given** INT supplies a replacement component for one item type
  **When** the form renders
  **Then** that type uses the replacement, all other types use defaults, and the replacement receives value, change handler, validation state, and the accessibility identifiers it must apply (`id`, `aria-describedby`, `aria-invalid`). The override is keyed by control kind, which refines item type: `choice` alone has five (ADR-0013 amendment note, 2026-09-24).

#### US-10.4 — Tier 4: headless
**As** INT, **I want** the engine with no UI at all, **so that** I can render in React Native or a bespoke design system.
**Priority:** Must

- **AC-10.4.1 — No DOM dependency**
  **Given** `@fhirq/core` is imported in a Node process
  **When** the full lifecycle runs — load, answer, evaluate, validate, emit
  **Then** it completes with no DOM API referenced anywhere in the package, verified by a Node-only test suite and by NFR-C-04.

---

## 12. E11 — Accessibility

**Goal.** Verifiable, not asserted (Brief §3). Numbers in `03-nfr.md` §5.

#### US-11.1 — Keyboard operation
**As** RES using a keyboard only, **I want** to complete the entire form, **so that** I am not excluded from care.
**Priority:** Must

- **AC-11.1.1 — Full reachability**
  **Given** any supported item type including repeating group add/remove controls
  **When** RES navigates with Tab, Shift+Tab, arrows, Space and Enter
  **Then** every interactive element is reachable and operable in document order, with no keyboard trap, and radio groups use roving focus rather than tab-per-option.
- **AC-11.1.2 — Visible focus**
  **Given** any focusable element
  **When** it receives keyboard focus
  **Then** a focus indicator meeting NFR-A-04 is visible, including in forced-colors mode.

#### US-11.2 — Assistive technology semantics
**As** RES using a screen reader, **I want** structure and state announced, **so that** I know what is being asked and what is required.
**Priority:** Must

- **AC-11.2.1 — Structure**
  **Given** a nested and repeating questionnaire
  **When** RES navigates by group and heading
  **Then** groups are exposed as labelled regions or fieldsets, repeat instances are individually distinguishable by accessible name, and nesting matches the document hierarchy.
- **AC-11.2.2 — Item state**
  **Given** a required item with an error
  **When** RES focuses it
  **Then** the accessible name, the required state, the current value and the error text are all announced, with the error linked by `aria-describedby` and `aria-invalid` set.

#### US-11.3 — Dynamic change is perceivable
**As** RES using a screen reader, **I want** to be told when the form changes under me, **so that** appearing and disappearing questions are not silent.
**Priority:** Must

- **AC-11.3.1 — Error summary and focus**
  **Given** completion is attempted with errors
  **When** validation fails
  **Then** focus moves to an error summary listing each error as a link to its item, and activating a link focuses that item.
- **AC-11.3.2 — Change announcements**
  **Given** an answer causes items to appear or disappear, or a repeat instance is added or removed
  **When** the change occurs
  **Then** a polite live-region message states what changed and how many items are affected, coalesced to at most one announcement per user action; a change with no user action behind it, such as options arriving, is announced as its own change.

#### US-11.4 — Visual accessibility
**As** RES with low vision, **I want** to zoom and re-flow, **so that** I can read the form on my terms.
**Priority:** Must

- **AC-11.4.1 — Reflow and contrast**
  **Given** 400% zoom at a 1280 px viewport, and separately a 320 px viewport
  **When** the form renders
  **Then** content reflows with no horizontal scrolling and no loss of function, and all text and UI contrast meets NFR-A-03.
- **AC-11.4.2 — User preferences honoured**
  **Given** `prefers-reduced-motion`, `prefers-color-scheme` and `forced-colors`
  **When** each is active
  **Then** transitions are suppressed, the dark token set applies, and controls, focus and error states remain distinguishable using system colours.

#### US-11.5 — Accessibility evidence
**As** INT, **I want** to see the a11y claim tested rather than stated, **so that** I can put it in front of my own QA process.
**Priority:** Must

- **AC-11.5.1 — Automated gate**
  **Given** every CI run
  **When** automated accessibility checks run across the demo forms in all four tiers and both themes
  **Then** the build fails on any violation at the level in NFR-A-01, and the report is published as a build artifact.
- **AC-11.5.2 — Manual evidence published**
  **Given** a release
  **When** INT opens the accessibility documentation
  **Then** they find a dated manual test record naming the screen reader/browser pairs in NFR-A-02, the WCAG 2.2 AA criteria checked, and an honest list of known gaps.

---

## 13. E12 — Playground

**Goal.** The first thing an evaluating team touches, and STK's entire evaluation. Brief §2 gives this 30 seconds to a few minutes, often on a phone.

#### US-12.1 — Immediate comprehension
**As** STK, **I want** to understand what this does without reading, **so that** I can decide from my phone whether it is worth my team's time.
**Priority:** Must

- **AC-12.1.1 — Working form above the fold**
  **Given** a first visit on a 375 px viewport
  **When** the page loads within the budget in NFR-P-06
  **Then** an interactive demo form is visible above the fold with no empty state, no configuration step and no modal, and one sentence states what the library is.
- **AC-12.1.2 — Logic is visible in one interaction**
  **Given** the default questionnaire is the demo fixture from E15
  **When** STK answers the first question
  **Then** conditional questions appear immediately, showing the rules engine at work without any explanation being read.

#### US-12.2 — Live response pane
**As** EVL, **I want** to see the emitted `QuestionnaireResponse` update as I type, **so that** I can check the retention policy myself.
**Priority:** Must

- **AC-12.2.1 — Synchronized output**
  **Given** the response pane is open
  **When** any answer changes
  **Then** the emitted JSON updates within the latency in NFR-P-02, with a toggle between emitted response and engine state that makes the exclusion-on-hide behaviour visible side by side.

#### US-12.3 — Bring your own questionnaire
**As** INT, **I want** to paste my own `Questionnaire`, **so that** I can evaluate support before installing anything.
**Priority:** Must

- **AC-12.3.1 — Paste and render**
  **Given** INT pastes JSON into the editor
  **When** it is valid
  **Then** the form re-renders live; **and when** it is invalid or uses unsupported features, the diagnostics from AC-01.3.1 are shown in full with links to the relevant conformance matrix rows.
- **AC-12.3.2 — Nothing leaves the browser**
  **Given** pasted content
  **When** the playground processes it
  **Then** all processing is client-side, and a visible statement says so. The playground is served with a Content Security Policy whose `connect-src` is `'none'`, so the browser itself refuses any outbound request, and a network panel shows no request after the initial page assets load. The playground has no analytics (NFR-X-09).

#### US-12.4 — Tier and theme switcher
**As** EVL, **I want** to see the four customization tiers side by side, **so that** I can see in seconds how much control my team would have at each level.
**Priority:** Should

- **AC-12.4.1 — Switchable tiers**
  **Given** the tier switcher
  **When** EVL moves between defaults, tokens, slots and headless
  **Then** the same questionnaire re-renders in each tier with the same answers preserved, and the code needed for that tier is shown alongside.

#### US-12.5 — Shareable state
**As** MNT, **I want** to link to a specific playground state from an issue, discussion or docs page, **so that** the reader lands on the right thing.
**Priority:** Could

- **AC-12.5.1 — URL state**
  **Given** a chosen questionnaire, tier and theme
  **When** MNT copies the URL
  **Then** opening it reproduces that state — **ASSUMPTION: questionnaire content is encoded in the URL fragment only, never sent to a server, so no answer data can be transmitted**.

---

## 14. E13 — Documentation, ADRs, conformance matrix

**Goal.** EVL's 15–40 minutes. This epic is where an adopting team decides whether the library is deep enough to trust with a clinical form.

#### US-13.1 — README as the front door
**As** STK, **I want** the README to make the case immediately, **so that** I do not need the docs site.
**Priority:** Must

- **AC-13.1.1 — Above the fold**
  **Given** the GitHub landing view on a phone
  **When** STK reads the first screen
  **Then** they see a one-line positioning statement, an animated demo of the rules engine, the zero-dependency/no-PHI/no-platform claims with links to their evidence, install command, and a ≤ 10-line working example.

#### US-13.2 — Quickstart that works
**As** INT, **I want** to reach a rendered form fast, **so that** evaluation costs an evening, not a sprint.
**Priority:** Must

- **AC-13.2.1 — Time to first render**
  **Given** a clean machine
  **When** INT follows the quickstart verbatim
  **Then** a working form renders within the time in NFR-U-01, and every code sample in the docs is extracted from compiled, tested source rather than hand-written.

#### US-13.3 — ADRs
**As** EVL, **I want** the reasoning behind each significant decision, **so that** I can test it against my own team's constraints before adopting.
**Priority:** Must

- **AC-13.3.1 — Coverage**
  **Given** the ADR directory
  **When** EVL reads it
  **Then** each ADR states context, decision, alternatives considered and their rejection reasons, and consequences including costs accepted — with at minimum the decisions listed in NFR-M-05 covered.
- **AC-13.3.2 — Defensible unaided**
  **Given** any ADR
  **When** MNT reviews it before release
  **Then** every claim in it can be argued from first principles without reference to unverifiable behaviour of other systems or to rationale MNT cannot reconstruct.

#### US-13.4 — Conformance matrix
**As** INT, **I want** an honest support table, **so that** I can decide adoption in one screen.
**Priority:** Must

- **AC-13.4.1 — Row per feature**
  **Given** the matrix
  **When** INT reads it
  **Then** every FHIR Questionnaire/SDC feature in the bounded surface appears with status `supported` / `partial` / `not supported` / `out of scope`, a one-line reason for each exclusion, and a link to the test proving each supported row.
- **AC-13.4.2 — Enforced honesty**
  **Given** CI
  **When** the suite runs
  **Then** a check fails if any row marked `supported` has no linked passing test.

#### US-13.5 — Regulated-adoption pack
**As** INT, **I want** the artifacts my quality process demands, **so that** I can start a dependency review without emailing anyone.
**Priority:** Should

- **AC-13.5.1 — Review pack**
  **Given** a release
  **When** INT looks for adoption evidence
  **Then** they find: dependency inventory (runtime and transitive counts, licences), an SBOM, a written no-PHI/no-network statement with the test that enforces it, the accessibility record from AC-11.5.2, the browser support matrix, and the semver/deprecation policy — with the explicit statement that the library is not a medical device and that clinical validation remains the adopter's responsibility.

---

## 15. E14 — Packaging, supply chain, CI, release

#### US-14.1 — Zero runtime dependencies, enforced
**As** INT, **I want** the dependency claim mechanically guaranteed, **so that** it cannot rot between releases.
**Priority:** Must

- **AC-14.1.1 — CI gate**
  **Given** a pull request adding a runtime dependency to any published package
  **When** CI runs
  **Then** the build fails, naming the offending package, and this gate is described in the README next to the claim it protects.

#### US-14.2 — Bundle size budgets
**As** INT, **I want** a published, enforced size ceiling, **so that** my performance budget is safe.
**Priority:** Must

- **AC-14.2.1 — Budget gate**
  **Given** the budgets in NFR-S-02
  **When** CI measures each published entry point
  **Then** exceeding a budget fails the build, the current figures are published in the README, and each PR comment reports the delta against the base branch.

#### US-14.3 — Correct publishing metadata
**As** INT, **I want** imports to work in every toolchain I use, **so that** integration does not start with a module resolution fight.
**Priority:** Must

- **AC-14.3.1 — Resolution matrix**
  **Given** the published packages
  **When** the consumer smoke-test suite runs against the environments in NFR-C-02
  **Then** every combination imports, type-checks and executes — including Node ESM, a bundler, a TypeScript `node16`/`bundler` resolution project, and a plain browser script tag.
- **AC-14.3.2 — Types are first-class**
  **Given** a TypeScript consumer in strict mode
  **When** they use the public API incorrectly
  **Then** the error is caught at compile time, and no `any` appears in the public surface (verified by the API report in NFR-M-04).

#### US-14.4 — CI pipeline
**As** EVL, **I want** to see what the project refuses to merge, **so that** I can judge engineering standards without reading every file.
**Priority:** Must

- **AC-14.4.1 — Gates**
  **Given** any pull request
  **When** CI runs
  **Then** type-check, lint, unit and integration tests, coverage thresholds, accessibility checks, bundle budgets, dependency check, API surface diff and a build of the playground and docs all run, within the wall time in NFR-M-07, and every one is blocking.

#### US-14.5 — Release integrity
**As** INT, **I want** releases to be verifiable, **so that** supply-chain review passes.
**Priority:** Should

- **AC-14.5.1 — Provenance**
  **Given** a published version
  **When** INT inspects it
  **Then** it carries npm provenance attestation, a CycloneDX SBOM, a signed git tag, a changelog entry linking the merged PRs, and the Apache-2.0 licence and NOTICE file in the package.

#### US-14.6 — No network, no storage, no telemetry — mechanically proven
**As** INT, **I want** proof rather than a promise, **so that** the no-PHI boundary survives my security review.
**Priority:** Must

- **AC-14.6.1 — Enforcement test**
  **Given** a test environment where `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB` and `document.cookie` are replaced with throwing stubs
  **When** the full lifecycle of `@fhirq/core`, `@fhirq/react` and `@fhirq/themes` runs end to end
  **Then** no stub is invoked, and the same test with only the documented default resolver in `@fhirq/element` shows network access confined to that single documented code path. That path is one file, `packages/element/src/default-resolver.ts`, which also loads the questionnaire named by `src` (ADR-0012 amendment note, 2026-09-25).

---

## 16. E15 — Demo questionnaire fixture

**Brief §9.1 open question, resolved here as a BA recommendation for confirmation.**

#### US-15.1 — One fixture, three jobs
**As** MNT, **I want** a single questionnaire that is README demo, playground default and core test fixture, **so that** the form evaluators try first is the same form the test suite exercises.
**Priority:** Must

- **AC-15.1.1 — Exercises the hard parts at once**
  **Given** the demo questionnaire
  **When** it is analysed
  **Then** it contains at minimum: an `enableWhen` chain of depth ≥ 3, a repeating group whose children carry their own conditions, `enableBehavior = any` and `all` at least once each, a cross-field rule, at least eight of the supported item types, and a scored section — and a test asserts each of these properties so the fixture cannot drift.
- **AC-15.1.2 — Clinically plausible, legally clean**
  **Given** the fixture
  **When** MNT publishes it
  **Then** it is an original composition under the project's own licence, contains no copyrighted instrument text, and carries a header stating it is a demonstration artifact not for clinical use.
- **AC-15.1.3 — Recommended shape**
  **Given** the need for cascade, repetition and scoring in one form
  **When** the fixture is designed
  **Then** it is **ASSUMPTION: an original "pre-visit intake" form — screening section that gates a symptom section, a repeating "current medications" group with per-instance conditional fields, and an embedded PHQ-9-shaped scored block using original wording. PHQ-9 itself is kept as a separate flat fixture for the scoring docs example, since as Brief §9.1 notes it exercises nothing structural on its own.**
- **AC-15.1.4 — Visible in 30 seconds**
  **Given** STK on a phone
  **When** they answer the first question
  **Then** the cascade is visible without scrolling.

---

## 17. Confirmed exclusions

Carried from Brief §5 unchanged, restated here so no story quietly reintroduces them. Each appears as a row in the conformance matrix with its reasoning: FHIRPath expressions; terminology server / `ValueSet` resolution; advanced SDC rendering extensions; FHIR R5; Vue adapter; response storage or any PHI handling; PDF generation; questionnaire authoring UI; hosted service; full FHIR client.

Boundary clarifications added by analysis and domain modelling:
- **Printing.** Brief excludes PDF generation but promises printable HTML. Scoped here as: a print stylesheet on the default theme only, expanding disabled-item handling and repeating groups sensibly. No pagination control, no headers/footers. **ASSUMPTION: print stylesheet is `Should`, not `Must`.**
- **Reference backend** (Brief §9.5). **Recommendation: drop.** It adds a Docker surface, a synthetic-data obligation and a second thing that can break on an evaluator's machine, while serving no principle in §6 — the playground already shows STK the product working and the test suite gives EVL the evidence. Confirm.
- **`amended` status.** Not supported; a completed session is final and editing means resuming into a new session (AC-05.1.4).
- **Conditions that reach into a repeating group from outside it.** Not supported; rejected at load in `strict` mode (AC-02.5.4). R4 resolves them by document position, and the kit does not implement that rule.
- **Items nested under a question.** R4 allows them; not supported. Rejected at load in `strict` mode; in `lenient` mode the children are unsupported placeholders with a diagnostic (`04-domain.md` INV-D-17).
- **Initial values.** `initial[x]` and `answerOption.initialSelected` are ignored with a diagnostic in both load modes; items start empty (INV-D-18).
- **`time` and `Reference` answer options.** Handled like an unsupported item type (INV-D-19).
- **Conditions that test a calculated item.** Not supported; rejected at load in `strict` mode (AC-02.5.5).
- **Expression extensions other than `calculatedExpression`.** Not supported; rejected at load in `strict` mode and degraded towards the safe side in `lenient` mode (AC-01.3.3). FHIRPath itself stays out of scope; a host may supply an evaluator for `calculatedExpression` only (US-07.3).
- **Playground and docs analytics.** None; both sites deny all outbound connections through their Content Security Policy (AC-12.3.2, NFR-X-09).

---

## 18. Assumption register

Every guess in this document, for correction. Numeric assumptions live in `03-nfr.md` §11.

| # | Ref | Assumption |
|---|---|---|
| R1 | AC-01.2.2 | Only radio-button, drop-down and check-box `itemControl` codes are honoured; fallback threshold for radios vs listbox is 5 options |
| R2 | AC-01.3.1 | `strict` load mode is the default; `lenient` is opt-in |
| R3 | AC-03.2.4 | `questionnaire-minOccurs` / `questionnaire-maxOccurs` extensions are the supported cardinality mechanism for repeating groups |
| R4 | AC-03.2.5 | A repeating group with no data renders one empty instance, not zero |
| R5 | AC-04.2.3 | Validation timing default is on-blur, then live once an error is showing |
| R6 | AC-05.2.3 | The configurable retention alternative is a single `discard` mode; no per-item override in v1 |
| R7 | AC-07.2.3 | **Confirmed 2026-09-16** (`03-nfr.md` §12 #6, `06-roadmap.md` §6 decision 7): PHQ-9/GAD-7 scoring ships as a documented example and test fixture, not as a published package. A fifth package would reopen ADR-0008's lockstep surface for twenty lines an adopter copies |
| R8 | AC-12.5.1 | Playground share links encode state in the URL fragment only |
| R9 | AC-15.1.3 | **Confirmed 2026-09-16** (`06-roadmap.md` §6 decision 5): demo fixture is an original "pre-visit intake" form; PHQ-9 is a secondary flat fixture for scoring docs. Spike S0 supports authoring it rather than adopting a real instrument — in the surveyed corpus, instruments are either large and flat or small and conditional, never both (`00-s0-instrument-survey.md` §3) |
| R10 | §17 | **Confirmed 2026-09-16** (`06-roadmap.md` §6 decision 8, `03-nfr.md` §12 #5): print stylesheet stays `Should` priority — it is the third rung of a cut ladder that was declined, so it is in scope — and the reference backend is dropped, as ADR-0019 already assumed |
| R11 | Throughout | Diagnostics are a first-class, host-readable list on the session rather than console warnings |
| R12 | US-06.3 | Version drift is surfaced but never auto-resolved; the host decides |

---

## 19. Decisions confirmed from domain modelling

Raised in `04-domain.md` §9 (and, for the last two rows, in ADR follow-ups) and accepted on 2026-09-15. Each is now an acceptance criterion, so it is a confirmed requirement rather than an assumption. The six `D` decisions are argued in ADR-0001 to ADR-0006 (`docs/adr/`).

| # | Decision | Where it now lives |
|---|---|---|
| D1 | The questionnaire is fixed for a session's life; changing it means a new session | AC-01.1.4 |
| D2 | Commands against a disabled item are refused; hidden answers cannot be edited | AC-05.2.5 |
| D3 | Calculated items reject direct answers | AC-07.3.3 |
| D4 | Once an item has shown an error it stays live, including across hide/show; cross-field errors follow each target item's timing; form-level errors appear on completion attempt | AC-04.1.1, AC-04.2.4, AC-04.3.4 |
| D5 | Option lists are resolved when the session starts and are not part of the snapshot | AC-07.1.1, AC-05.3.3 |
| D6 | A throwing scoring function is handled like a throwing rule | AC-07.2.4 |
| T1 | `completed` is final; `amended` is not supported | AC-05.1.4, §17 |
| T2 | Resumed sessions always start `in-progress`; round-trip ignores `authored` and `status` | AC-06.1.2, AC-06.1.4 |
| T3 | Conditions resolve within the same repeat instance; conditions crossing into a repeating group from outside are rejected in `strict` mode (premise corrected 2026-09-17: R4 is not silent, `06-roadmap.md` M2 D5) | AC-02.5.4, §17 |
| T4 | A disabled item counts as unanswered for every condition | AC-02.2.4 |
| T5 | Removing a repeat instance is permanent; `discard` resets a disabled repeating group to one empty instance | AC-03.2.6, AC-05.2.6 |
| T6 | Diagnostics for rejected stored answers name path and types, never the value | AC-06.3.2 |
| T7 | On resume, answers to items that evaluate disabled are dropped with a diagnostic | AC-06.1.5 |
| T8 | Resumed coded answers are loaded and not invalidated while options are unknown | AC-07.1.4 |
| T9 | Stored instance counts above the maximum are loaded, flagged as an error, and block adding | AC-03.2.7 |
| T10 | An `open-choice` answer is either coded or free text; switching replaces it | AC-01.2.3 |
| T11 | Repeat instances have a permanent ordinal separate from their position; paths use ordinals | §0 vocabulary, AC-03.2.2, AC-03.4.1, AC-05.3.1 |
| T12 | A change with no user action behind it (e.g. options arriving) gets its own event and announcement | AC-06.2.1, AC-11.3.2 |
| §8 | A snapshot restored against a different questionnaire is refused | AC-05.3.3 |
| §8 | More than one stored answer for a non-repeating item is rejected, not partially loaded | AC-06.3.3 |
| ADR-0003 | Conditions that test a calculated item are rejected at load in `strict` mode, false with a diagnostic in `lenient` | AC-02.5.5, §17 |
| ADR-0006 | A throwing expression evaluator is handled like a throwing scorer: value cleared, diagnostic without message text, cycle continues | AC-07.3.4, AC-07.2.4 |

---

## 20. Decisions confirmed from architecture

Raised in `05-architecture.md` §8 and §9 and accepted on 2026-09-15. **AT5 (form participation for the web component) and assumptions A3–A6 were closed on 2026-09-16** in M0: A3–A6 accepted as written, AT5 out of v1 as a recorded follow-up (`06-roadmap.md` §6 decisions 9–13).

| # | Decision | Where it now lives |
|---|---|---|
| AT1 | Automated accessibility checks may use MPL-2.0 tooling such as axe-core, because it is dev-only and never distributed | `03-nfr.md` NFR-S-07; ADR-0018 |
| AT2 | In controlled mode, an echo of the last emitted response (same object or semantically equal copy) leaves the session untouched; a different response resumes a new session with a diagnostic; controlling by session preserves everything | AC-08.1.2, AC-08.1.3, AC-08.1.4; ADR-0015 |
| AT3 | Expression extensions other than `calculatedExpression` are unsupported constructs: rejected in `strict`, degraded towards the safe side in `lenient` | AC-01.3.3, AC-07.3.1, §17; `04-domain.md` INV-D-15; ADR-0017 |
| AT4 | No analytics on the playground or docs; both are served with a CSP whose `connect-src` is `'none'` | AC-12.3.2, §17; `03-nfr.md` NFR-X-09; ADR-0019 |
| A1 | The presentation model entry point `@fhirq/core/view` is budgeted at ≤ 5 kB and the structural stylesheet `base.css` at ≤ 4 kB | `03-nfr.md` NFR-S-02; ADR-0007 |
| A2 | The React adapter's ≤ 6 kB budget excludes core and view as well as React | `03-nfr.md` NFR-S-02 |
