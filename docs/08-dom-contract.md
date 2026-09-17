# FHIR Questionnaire Kit — DOM contract

*The markup both renderers emit for each view-model concept (ADR-0007). `@fhirq/react` renders it in light DOM; `@fhirq/element` renders it inside its open shadow root (ADR-0014). `@fhirq/themes/base.css` styles it by class; hosts restyle it by `--fhirq-*` token, by class (React) or by `::part()` (element). One contract suite runs against both renderers: `tests/browser/contract.spec.ts`.*

**Status:** S1 slice, 2026-09-16. Covers the two control kinds of M1 (`yes-no`, `short-text`), the error summary and the live region. M5 completes it for every control kind; until then, anything not written here is not part of the contract. Class names, `part` names and the roles and ARIA attributes below are covered by semver from 1.0.0.

---

## 1. Rules that apply to every row

- **Class and `part` share a stem.** A class is `fhirq-<stem>`; its `part` is `<stem>`. Classes are prefixed because React renders into the host's light DOM; `part` names are not, because `::part()` is already scoped to the element.
- **Every id comes from the view model.** A renderer never builds an id. Node ids are `node.ids.{control,label,description,error}`; form-level ids are `errorSummary.id` and `errorSummary.headingId`. React's prefix is `useId()`, the element's is `fhirq` (its shadow root scopes it).
- **Every id reference resolves inside the same tree.** `for`, `aria-labelledby`, `aria-describedby` and summary `href`s point into the renderer's own root, never across a shadow boundary.
- **`data-path` carries the item path** on each item's root. It is the key the element's patcher and the contract suite use; it never carries an answer.
- **ARIA state is always present as a string.** `aria-required` and `aria-invalid` are `"true"` or `"false"`, never omitted. `aria-describedby` is present only while it has something to point at.
- **No `style` attribute, no `<style>` element, no `el.style` write** anywhere, in either renderer (NFR-C-07, ADR-0014).
- **Visual-only marks are hidden from assistive technology.** The required marker carries `aria-hidden="true"`; the requirement itself is `aria-required`.

## 2. The form

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| The form root | `div` | `fhirq-form` | `form` | — |
| `errorSummary` (when not `null`) | `section`, first child of the form | `fhirq-summary` | `error-summary` | `id` = `errorSummary.id`, `tabindex="-1"`, `aria-labelledby` = `errorSummary.headingId` |
| `errorSummary.heading` | `h2` | `fhirq-summary-heading` | `error-summary-heading` | `id` = `errorSummary.headingId` |
| `errorSummary.entries` | `ul` | `fhirq-summary-list` | `error-summary-list` | — |
| each entry | `li` > `a` | `fhirq-summary-entry` > `fhirq-summary-link` | `error-summary-entry` > `error-summary-link` | `href` = `#` + `entry.target`; activating it moves focus to that id |
| `nodes` | one item root each, in order, after the summary | see §3 | | |
| `announcement` | `div`, last child of the form | `fhirq-status` | `status` | `role="status"`; text is written after the render that produced it, never during it |

**Focus.** When `focusTarget` is a new object, focus moves to the element with its `id`, after rendering. After a refused completion that is the summary `section`.

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
| the control | `input type="text"` | `fhirq-control` | `control` | `id` = `ids.control`, `aria-required`, `aria-invalid`, `aria-describedby` = `ids.error` while `invalid`; `.value` = `value` |

`set` is called on every input with the whole value; `set('')` clears the answer. `leave` is called when focus leaves the item root.

### 3.2 `yes-no`

| View model | Element | Class | `part` | Attributes |
|---|---|---|---|---|
| `label` | `span` | `fhirq-label` | `label` | `id` = `ids.label` |
| the group | `div` | `fhirq-choices` | `choices` | `role="radiogroup"`, `aria-labelledby` = `ids.label`, `aria-required`, `aria-invalid`, `aria-describedby` = `ids.error` while `invalid` |
| each choice | `label` | `fhirq-choice` | `choice` | — |
| its radio | `input type="radio"`, first child of the choice | `fhirq-radio` | `radio` | `name` = `ids.control`; `id` = `ids.control` on the **first** choice only; `value` = `"true"` or `"false"`; `.checked` = `choice.selected` |
| its text | `span` | `fhirq-choice-label` | `choice-label` | text = `choice.label` |

Native same-name radios provide the roving tab stop and arrow-key selection NFR-A-07 asks for; no `tabindex` is managed. Unanswered (`value: null`) is no radio checked. `ids.control` sits on the first radio because it is the focusable element a summary link must reach (ADR-0013). `leave` is called when focus leaves the item root, not when it moves between the two radios.

## 4. What the contract suite asserts

For each of the three slice states (initial, string item shown, errors surfaced), both renderers produce the same tree of elements, classes, `part` names, roles and attributes; every id reference resolves in the same root and is described by the element it reaches; the input's `.value` and `.checked` match; and Playwright's ARIA snapshot (roles, accessible names, states) is identical. Ids themselves are compared by what they resolve to, never by value, since the prefixes differ.
