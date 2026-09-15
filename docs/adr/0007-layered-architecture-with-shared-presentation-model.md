# ADR-0007 — Layered architecture: headless core, shared presentation model, thin native renderers

- **Status:** Accepted
- **Date:** 2026-09-15
- **Traces to:** Brief §5, §6 principle 3 · AC-08.2.1, AC-08.3.1, AC-10.3.1, AC-11.2.2, AC-11.3.1–2, AC-12.4.1 · NFR-S-02, NFR-C-03, NFR-C-04, NFR-C-08, NFR-Q-01, NFR-Q-03, NFR-A-01, NFR-U-05, NFR-Z-01 · BC6, INV-P-01–05 · `05-architecture.md` §2–4 · NFR-M-05 topic *core/adapter/element layering*

## Context

The kit ships a DOM-free engine and two default user interfaces: a React component and a `<fhir-questionnaire>` custom element. Both UIs must meet WCAG 2.2 AA, with automated checks on every build and a manual screen-reader record for each release.

The engine's layering is already fixed by the requirements: it runs in Node with no DOM (NFR-C-04), and the React default UI must be built on the headless hook (AC-08.2.1). What is open is **where presentation behaviour lives**. That means everything in BC6 that is not markup:

- which control an item uses (INV-P-05);
- stable ids and ARIA state (INV-P-02);
- announcement text and coalescing (INV-P-03);
- the error summary and where focus goes after a refused completion (AC-11.3.1);
- focus after adding or removing a repeat instance (AC-03.2.1);
- the inert add control with its reason (INV-P-04);
- the unsupported-item placeholder (AC-01.3.2).

This is the most expensive UI code to get right, the code accessibility reviewers probe hardest, and the code most likely to differ between two hand-written implementations. The build budget is 40–60 hours (NFR-Z-01).

## Options considered

**A. Headless core, independent native renderers.** Each renderer implements BC6 in its own idiom. Rejected. Every BC6 rule would be written, tested and screen-reader-verified twice. The two copies would drift, and drift here means an accessibility defect in one renderer only. The logic would also sit in adapter packages under the weaker coverage gate (NFR-Q-02 rather than NFR-Q-01) and outside mutation testing (NFR-Q-03). Duplicating BC6 is the biggest avoidable cost against NFR-Z-01.

**B. Headless core, shared DOM-free presentation model, thin native renderers.** Chosen; see Decision.

**C. Element-first: the custom element is the only UI, and React wraps it.** Rejected. React cannot server-render a custom element's shadow content, so there would be no form in server markup (fails AC-08.3.1 and NFR-C-08). The React package would contain the element and blow its 6 kB budget (NFR-S-02). React 18 needs ref-based property wiring for custom elements (NFR-C-03). The React default UI would no longer be built on the hook (fails AC-08.2.1). And React tier-3 overrides would sit in light DOM behind `<slot>`, where `aria-describedby` cannot reference error text inside the shadow root (fails AC-10.3.1 and AC-11.2.2).

**Screened out before comparison:** a UI built on Lit, Stencil or Preact (a runtime dependency, NFR-S-01); an engine in a Web Worker (session creation must be synchronous, AC-01.1.1); build-time compilation of questionnaires (a questionnaire change would need a release, and runtime compilation needs `new Function`, NFR-C-07).

## Decision

Four layers. Each depends only on the layers beneath it.

| Layer | Published as | Knows about | Never touches |
|---|---|---|---|
| 1. Engine | `@fhirq/core` | FHIR R4 (at its edges only, ADR-0016), domain | DOM, network, storage, frameworks |
| 2. Presentation model | `@fhirq/core/view` (subpath export) | Engine public API, message catalogue | DOM, frameworks, markup |
| 3. Renderers | `@fhirq/react`, `@fhirq/element` | View nodes, their platform | Engine internals |
| 4. Styling | `@fhirq/themes` | The DOM contract (class and `part` names) | JavaScript |

**The presentation model** is a pure function from a settled session (plus presentation options such as the id prefix) to:

- a **view node** per item node: control kind, label and help text (plain, or sanitised when a sanitiser is supplied), ids `{ control, label, description, error }`, `required`, `invalid`, surfaced issues, options and their resolution state, repeat metadata (position, can add, can remove, reason when not), and bound command functions (`set`, `clear`, `leave`, `add`, `remove`, `retry`);
- the **announcement** for the cycle, if any;
- the **error summary** after a refused completion;
- a **focus target** when a command implies one (a new instance, the summary).

View nodes are created per cycle **only for nodes that changed**. Unchanged nodes keep their object identity, so renderers can skip them with reference equality.

The view model is *semantic*, not a tree of elements. It never says "div", "fieldset" or "radio input". The renderers decide markup, and both follow one written **DOM contract**: the element and role used for each control kind, class names, `part` names, and the ARIA attributes each id populates. A single contract test suite runs against both renderers.

**The renderers** stay mechanical. React maps view nodes to JSX and uses `React.memo` keyed by item path. The element maps view nodes to DOM with a keyed patcher: it updates attributes and text in place and never replaces a focused control.

## Consequences

**Benefits**
- **Each BC6 rule is written once,** in a DOM-free module tested in Node under the core coverage and mutation gates. The renderers' remaining job, markup, is checked structurally by one contract suite and by the automated accessibility gate.
- **The tier-3 override contract is the view-node type** (ADR-0013). The ids an override must apply (AC-10.3.1) are fields on the object it receives, not a convention to document.
- **Tier switching cannot lose state** (AC-12.4.1, INV-P-01), because the presentation model is derived and the session lives beneath it.
- **One structural stylesheet** serves both renderers, because both emit the same class and `part` names.
- **Headless integrators** (React Native, bespoke design systems) can use the presentation model without any of the kit's markup, and get the accessibility logic for free.

**Costs accepted**
- **A second entry point with its own budget.** NFR-S-02 now budgets it at ≤ 5 kB (accepted 2026-09-15, `05-architecture.md` §8 A1).
- **More public types.** View-node and override types count against the 60-symbol cap (NFR-U-05). This is mitigated because the same types are the tier-3 contract, which would need exporting in any design.
- **Risk of a home-made virtual DOM.** The guard is the rule above: view nodes carry meaning, never element names. A review checklist item fails any view-model field that names an HTML element or CSS property.
- **The vanilla renderer must patch the DOM, not rebuild it.** That is harder to write than a full re-render, but required: rebuilding would lose caret position and focus on every keystroke, which fails NFR-A-07 and NFR-P-03.
- **Manual screen-reader passes still cover two renderers.** Sharing behaviour lowers the risk of differences between them; it does not remove the need to check both.

**Verification**
- Lint: `view/` imports no DOM globals and no framework (the NFR-M-06 "no DOM in core" rule applies to the whole core package); renderers import `@fhirq/core` and `@fhirq/core/view` public entry points only (the "no deep imports" rule).
- The DOM contract suite renders the demo fixture through both renderers and asserts identical roles, accessible names, ARIA relationships, class names and `part` names per item path.
- The React default UI imports only the public hook and view types; a test fails if it imports anything the headless tier cannot.
- A Node-only test drives the demo fixture through a refused completion and asserts the error summary order, focus target and announcement text, with no renderer involved.
