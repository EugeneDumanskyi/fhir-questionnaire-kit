# FHIR Questionnaire Kit — DOM contract

*The markup both renderers emit for each view-model concept (ADR-0007). `@fhirq/react` renders it in light DOM; `@fhirq/element` renders it inside its open shadow root (ADR-0014). `@fhirq/themes/base.css` styles it by class; hosts restyle it by `--fhirq-*` token, by class (React) or by `::part()` (element). One contract suite runs against both renderers: `tests/browser/contract.spec.ts`.*

**Status:** complete for every control kind, 2026-09-23 (M5). §3.1 and §3.2 are the S1 rows, which both renderers build today; §3.3 onward are what M6 and M7 build, and the contract suite covers each row as its renderer lands. Anything not written here is not part of the contract. Class names, `part` names and the roles and ARIA attributes below are covered by semver from 1.0.0.

---

## 1. Rules that apply to every row

- **Class and `part` share a stem.** A class is `fhirq-<stem>`; its `part` is `<stem>`. Classes are prefixed because React renders into the host's light DOM; `part` names are not, because `::part()` is already scoped to the element.
- **Every id comes from the view model.** A renderer never builds an id. Node ids are `node.ids.{control,label,description,error}`; form-level ids are `errorSummary.id` and `errorSummary.headingId`. React's prefix is `useId()`, the element's is `fhirq` (its shadow root scopes it).
- **Every id reference resolves inside the same tree.** `for`, `aria-labelledby`, `aria-describedby` and summary `href`s point into the renderer's own root, never across a shadow boundary.
- **`data-path` carries the item path** on each item's root. It is the key the element's patcher and the contract suite use; it never carries an answer.
- **ARIA state is always present as a string.** `aria-required` and `aria-invalid` are `"true"` or `"false"`, never omitted. `aria-describedby` is present only while it has something to point at.
- **No `style` attribute, no `<style>` element, no `el.style` write** anywhere, in either renderer (NFR-C-07, ADR-0014).
- **Visual-only marks are hidden from assistive technology.** The required marker carries `aria-hidden="true"`; the requirement itself is `aria-required`.
- **Text comes from the view model.** A renderer writes no user-facing string of its own (NFR-I-01): labels, options, issue text, the summary, add and remove labels, and the fixed `labels.*` strings all arrive formatted.
- **Rich text only as given.** Where `richLabel` is not `null`, it is rendered as markup in place of `label`'s text; it is already the host sanitizer's output (INV-X-06). Otherwise `label` is set as text, never as markup.
- **Keys are values.** A radio's, checkbox's or option's `value` attribute is the option's `key`, and a change calls `set` or `toggle` with it as read; a renderer never maps keys to answers.
- **The leave rule (M5 plan D11).** `leave()` is called on `focusout` from the item root when `relatedTarget` is outside that root, including `null`. Focus moving between parts of one item (two radios, an entry and its unit) is not leaving it. This is the one behaviour both renderers implement rather than read from the view: it needs the DOM.

## 2. The form

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| The form root | `div` | `fhirq-form` | `form` | — |
| `errorSummary` (when not `null`) | `section`, first child of the form | `fhirq-summary` | `error-summary` | `id` = `errorSummary.id`, `tabindex="-1"`, `aria-labelledby` = `errorSummary.headingId` |
| `errorSummary.heading` | `h2` | `fhirq-summary-heading` | `error-summary-heading` | `id` = `errorSummary.headingId` |
| `errorSummary.entries` | `ul` | `fhirq-summary-list` | `error-summary-list` | — |
| each entry | `li` > `a` | `fhirq-summary-entry` > `fhirq-summary-link` | `error-summary-entry` > `error-summary-link` | `href` = `#` + `entry.focusId`; activating it moves focus to that id |
| an entry with `focusId: null` (a form-level issue) | `li`, text only, no link | `fhirq-summary-entry` | `error-summary-entry` | — |
| `nodes` | one item root each, in order, after the summary | see §3 | | |
| `announcement` | `div`, last child of the form | `fhirq-status` | `status` | `role="status"`; text is written after the render that produced it, never during it |

**Focus.** When `focusTarget` is a new object, focus moves to the element with its `id`, after rendering. After a refused completion that is the summary `section`; after an added instance, its first control; after a removed one, the neighbouring instance's first control or the group's add control. A view has no target on its first model, so mounting never moves focus.

## 3. Items

Every item root is a `div.fhirq-item` with `part="item"` and `data-path`. Its last child is always the error container:

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| `issues` | `div`, last child of the item | `fhirq-error` | `error` | `id` = `ids.error`; `hidden` while `invalid` is `false` |
| each issue | `p` | `fhirq-error-message` | `error-message` | text = `issue.message` |
| `required` | `span`, last child of the label | `fhirq-required` | `required` | `aria-hidden="true"`; text = `requiredMarker`; absent when not required |

### 3.1 `short-text`

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| `label` | `label` | `fhirq-label` | `label` | `id` = `ids.label`, `for` = `ids.control` |
| the control | `input type="text"` | `fhirq-control` | `control` | `id` = `ids.control`, `aria-required`, `aria-invalid`, `aria-describedby` = `ids.error` while `invalid`; `.value` = `entry` |

`set` is called on every input with the whole text; `set('')` clears the answer. `leave` is called by the leave rule (§1).

### 3.2 `yes-no`

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| `label` | `span` | `fhirq-label` | `label` | `id` = `ids.label` |
| the group | `div` | `fhirq-choices` | `choices` | `role="radiogroup"`, `aria-labelledby` = `ids.label`, `aria-required`, `aria-invalid`, `aria-describedby` = `ids.error` while `invalid` |
| each choice | `label` | `fhirq-choice` | `choice` | — |
| its radio | `input type="radio"`, first child of the choice | `fhirq-radio` | `radio` | `name` = `ids.control`; `id` = `ids.control` on the **first** choice only; `value` = `choice.key` (`"true"` or `"false"`); `.checked` = `choice.selected`; `change` calls `set(choice.key)` |
| its text | `span` | `fhirq-choice-label` | `choice-label` | text = `choice.label` |

Native same-name radios provide the roving tab stop and arrow-key selection NFR-A-07 asks for; no `tabindex` is managed. Unanswered (`value: null`) is no radio checked. `ids.control` sits on the first radio because it is the focusable element a summary link must reach (ADR-0013). `leave` is called when focus leaves the item root, not when it moves between the two radios.

### 3.3 Entry kinds: `long-text`, `integer`, `decimal`, `calendar-date`, `date-time`

As `short-text` (§3.1), with these differences. The control shows `entry`, never `display`, and `set` is called with the whole text on every input; the view keeps text that is not a value yet and says so in `issues` (INV-P-06).

| Kind | Control | Attributes beyond §3.1 |
|---|---|---|
| `long-text` | `textarea` | — |
| `integer` | `input type="text"` | `inputmode="numeric"` |
| `decimal` | `input type="text"` | `inputmode="decimal"` |
| `calendar-date`, `date-time` | `input type="text"` | — (the entry form is FHIR's: `2024`, `2024-05`, `2024-05-01`, `2024-05-01T14:30`; no native date input, which cannot enter `2024` or `2024-05`, M5 plan D4) |

`type="number"` is not used: it drops text that is not a number yet, which the view needs to keep and report.

**A repeating question** (`entries` not `null`) renders one control per entry, in order, inside a `div.fhirq-entries` (`part="entries"`). The first carries `ids.control`; each calls `setAt(index, text)`; all carry `aria-labelledby` = `ids.label`. The trailing empty entry is how another answer is added.

### 3.4 `quantity`

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| the value | `input type="text"`, as §3.3 `decimal` | `fhirq-control` | `control` | `id` = `ids.control` |
| `units`, when not empty | `select` after the value | `fhirq-unit` | `unit` | `aria-label` = `labels.unit`; one `option` per unit, `value` = `key`, `selected` from `selected`, plus a first empty `option` while none is selected; `change` calls `setUnit(key)` |
| `unit`, when `units` is empty | `input type="text"` after the value | `fhirq-unit` | `unit` | `aria-label` = `labels.unit`; `.value` = `unit`; `input` calls `setUnit(text)` |

### 3.5 Option kinds

Every option kind shows `optionMessage` while it is not `null`, in a `p.fhirq-options-status` (`part="options-status"`) before the options, and, when `optionState` is `failed`, a `button type="button"` `.fhirq-retry` (`part="retry"`) with text `labels.retry` that calls `retry()`. Options are rendered in the order given, each with `value` = `key`.

| Kind | Group | Each option | Changes |
|---|---|---|---|
| `single-choice` | `div.fhirq-choices`, `role="radiogroup"` (as §3.2) | `label.fhirq-choice` > `input type="radio"` `.fhirq-radio` + `span.fhirq-choice-label` | `change` calls `set(key)` |
| `single-list` | `select.fhirq-control` with `size` = the lesser of the option count and 8 | `option` | `change` calls `set(value)` |
| `single-menu` | `select.fhirq-control` | a first `option` with `value=""` and text `labels.choose`, then one `option` each | `change` calls `set(value)`, or `clear()` for the empty option |
| `multi-choice` | `div.fhirq-choices`, `role="group"` | `label.fhirq-choice` > `input type="checkbox"` `.fhirq-checkbox` + `span.fhirq-choice-label` | `change` calls `toggle(key)` |
| `multi-list` | `select.fhirq-control` with `multiple` and `size` as `single-list` | `option` | `change` calls `set([...selected values])` |

`ids.control` goes on the group's first radio or checkbox, as in §3.2, or on the `select`. `aria-required`, `aria-invalid` and `aria-describedby` go on the radiogroup or group, or on the `select`.

**Open choice** (`other` not `null`): after the options, a `label.fhirq-other` (`part="other"`) with text `labels.other` wrapping an `input type="text"` `.fhirq-other-text` (`part="other-text"`) whose `.value` is `other` and whose `input` calls `setOther(text)`. It is part of the item, so moving to it from an option is not leaving the item.

### 3.6 Read-only kinds

| Kind | Markup |
|---|---|
| `calculated` | the label as a `span.fhirq-label` with `id` = `ids.label`, then `output.fhirq-value` (`part="value"`) with `id` = `ids.control`, `aria-labelledby` = `ids.label`, text = `display` |
| `statement` | `p.fhirq-statement` (`part="statement"`) with `id` = `ids.label`, text = `label` (or `richLabel`) |
| `unsupported` | `div.fhirq-unsupported` (`part="unsupported"`): the label as a `span.fhirq-label`, then `p.fhirq-notice` (`part="notice"`) with text = `notice`. No control, no focus stop (AC-01.3.2) |

None of these carries `aria-required` or calls `leave`.

### 3.7 Groups

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| `group` | `fieldset` as the item root | `fhirq-item fhirq-group` | `item group` | `data-path`; `aria-describedby` = `ids.error` while `invalid` |
| its label | `legend` | `fhirq-label` | `label` | `id` = `ids.label`, `tabindex="-1"` (a summary link may target it) |
| `children` | item roots, in order, inside the fieldset | | | |

A group's own issues (`required` on a group) use the error container of §3, as the fieldset's last child.

### 3.8 Repeating groups

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| `repeating-group` | `fieldset` as the item root | `fhirq-item fhirq-repeat` | `item repeat` | `data-path`, `aria-describedby` = `ids.error` while `invalid` |
| its label | `legend` | `fhirq-label` | `label` | `id` = `ids.label`, `tabindex="-1"` |
| each of `instances` | `section`, in order | `fhirq-instance` | `instance` | `data-path` = `instance.path`, `aria-labelledby` = `instance.ids.label` |
| the instance's name | `h3` (a level below the nearest heading), first child | `fhirq-instance-label` | `instance-label` | `id` = `instance.ids.label`, text = `instance.label` |
| the instance's `children` | item roots, after the name | | | |
| `remove` | `button type="button"`, last child of the instance | `fhirq-remove` | `remove` | `id` = `instance.ids.control`, text = `instance.removeLabel` |
| `add` | `button type="button"` after the instances | `fhirq-add` | `add` | `id` = `ids.control`, text = `addLabel`; when `canAdd` is `false`: `aria-disabled="true"` and `aria-describedby` = `ids.description` |
| `reason` | `p`, after the add control, while not `null` | `fhirq-reason` | `reason` | `id` = `ids.description` |

The add control stays focusable when inert (`aria-disabled`, not `disabled`), so the reason can be reached and read (INV-P-04); activating it calls `add()`, which the session refuses at `maxOccurs`. Instances are keyed by `instance.path`, never by position (T11).


## 4. What the contract suite asserts

For each of the three slice states (initial, string item shown, errors surfaced), both renderers produce the same tree of elements, classes, `part` names, roles and attributes; every id reference resolves in the same root and is described by the element it reaches; the input's `.value` and `.checked` match; and Playwright's ARIA snapshot (roles, accessible names, states) is identical. Ids themselves are compared by what they resolve to, never by value, since the prefixes differ.
