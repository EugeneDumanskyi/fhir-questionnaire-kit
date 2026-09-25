# ADR-0014 — The element renders into shadow DOM styled by constructable stylesheets

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** Brief §3 secondary user · E09 (AC-09.1.1–2, AC-09.2.1–2, AC-09.3.1), AC-10.3.1, AC-11.2.2, AC-11.3.1 · NFR-C-01, NFR-C-07, NFR-S-02, NFR-S-03, NFR-A-01, NFR-A-04, NFR-A-07 · ADR-0007, ADR-0013 · `05-architecture.md` §8 A4, §9 AT5 · NFR-M-05 topic *shadow DOM in the element*

## Context

`<fhir-questionnaire>` exists for the embedder: a Rails, Django, .NET or CMS page with a script tag and no build step. Those pages often carry old, global stylesheets (`* { box-sizing: content-box }`, bare `input { … }` rules), and the form must survive them without leaking styles back (AC-09.2.1). The host must still be able to theme it deliberately (AC-09.2.2).

Three requirements make this harder than "use shadow DOM":

1. **Strict CSP.** The kit must run under `style-src 'self'` with no `unsafe-inline` (NFR-C-07). A `<style>` element inside a shadow root is an inline style and is blocked. Inline `style="…"` attributes are blocked too.
2. **ARIA references do not cross shadow boundaries.** `aria-describedby`, `aria-labelledby` and `<label for>` resolve ids within the same tree. An error message in the shadow root cannot describe a control in light DOM, and vice versa.
3. **Keyboard and screen-reader flow** must be unaffected (NFR-A-07, AC-11.3.1). Focus must reach the error summary and the linked controls.

The supported-browser floor is the last two major versions of evergreen browsers and iOS Safari 16.4+ (NFR-C-01).

## Options considered

**A. Light DOM with prefixed class names.** Rejected. Host global CSS applies to every element, so AC-09.2.1 fails on the first `input { width: 100% }`. Defending against it means resetting every property on every element with high-specificity selectors, which costs bytes and still loses to `!important`.

**B. Shadow DOM with a `<style>` element.** The common approach. Rejected, because it violates NFR-C-07. Nonces and hashes are not available to a script-tag embed that cannot know the host's CSP.

**C. Shadow DOM with `<link rel="stylesheet">` to a hosted CSS file.** CSP-compatible under `'self'` when the file is same-origin. Rejected. The embedder must host and path-configure a second file, which breaks the one-script-tag promise (AC-09.1.1), and the form flashes unstyled until the sheet loads. A CDN-hosted sheet is a different origin and fails `style-src 'self'`.

**D. `<iframe>`.** Total isolation. Rejected: tokens cannot cross, the host must size the frame to content that changes with every `enableWhen`, focus and screen-reader navigation break at the frame boundary, and events need `postMessage`.

**E. Shadow DOM styled with constructable stylesheets (`new CSSStyleSheet()` + `replaceSync`, assigned to `shadowRoot.adoptedStyleSheets`).** Chosen.

## Decision

- **Open shadow root.** `attachShadow({ mode: "open" })`, so hosts and tests can inspect it. No `delegatesFocus`; focus is managed explicitly by the renderer from the view model's focus targets.
- **Styles.** At build time, `@fhirq/themes/base.css` and the default preset are embedded in the element bundle as strings. At runtime, one `CSSStyleSheet` per stylesheet is created **once per document** and shared through `adoptedStyleSheets` by every instance. No `<style>` elements, no `style` attributes, no `el.style` writes.
- **Theming holes.** Custom properties `--fhirq-*` inherit through the shadow boundary from the host element or any ancestor (tier 2). Documented `part` names on control, label, help, error, group, instance, add/remove button and error summary allow `::part()` overrides. The `part` names are the same as the DOM contract's class names (ADR-0007) and are covered by semver.
- **Everything ARIA-linked lives in one shadow root.** Labels, controls, help, errors, the error summary and the live region all render inside the element's shadow root, so every id reference resolves. `<slot>` is **not** used for controls.
- **Tier-3 overrides render inside the shadow root.** The host maps an item type to a custom element tag it has defined. The renderer creates that element *inside* the shadow root, sets a `props` property (ADR-0013 `ControlProps`) and listens for `fhirq-set`, `fhirq-clear` and `fhirq-leave` events. The override's own internals may use their own shadow root; the id the kit passes goes on the override's host element, which sits in the kit's tree.
- **Ids are scoped by the shadow root.** Each element instance has its own tree, so path-derived ids (`fhirq-<path>`) cannot collide between two forms on a page.
- **Connect and disconnect.** The session is created lazily on first connection, and it persists across disconnect and reconnect (AC-09.3.1). Listeners are attached in `connectedCallback` through one `AbortController` per connection and removed by aborting it in `disconnectedCallback`.

## Consequences

**Benefits**
- **Host CSS cannot reach the form, and the form's CSS cannot reach the host** (AC-09.2.1), with no reset stylesheet.
- **Runs under the strictest reasonable CSP with a single script tag.** Constructable stylesheets are CSSOM calls, not inline style elements, so `style-src` does not govern them. NFR-C-07's browser test proves this rather than relying on the specification.
- **One parsed stylesheet per page,** however many forms it shows.
- **ARIA relationships are structurally guaranteed** within the tree, including for tier-3 overrides.

**Costs accepted**
- **The iOS Safari 16.4 floor becomes load-bearing.** Adopted stylesheets arrive in Safari 16.4. Lowering NFR-C-01 would now need a CSP-compatible fallback (option C's hosted sheet), not just polyfill bytes (`05-architecture.md` §8 A4).
- **`<slot>`-based composition is off the table** for controls. Host developers who expect to project their own markup into a web component will find they must supply a custom element instead. The docs must explain that ARIA, not taste, drives this.
- **Host page features that assume a flat DOM do not see inside the form:** page-level `document.querySelector`, some browser extensions, some older automated testing tools. Open mode keeps it reachable for those who know to look.
- **No native form participation.** The element is not form-associated, so a host `<form>` does not submit the response. EMB must listen for `fhirq-change` or `fhirq-complete` and copy the response into a hidden field. Follow-up below.
- **Host fonts do not inherit automatically into custom-property-free contexts.** `font-family` inherits across the boundary, but the kit's structural CSS sets it from `--fhirq-font-family`, which defaults to `inherit`.

**Verification**
- AC-09.2.1: a Playwright page with aggressive global CSS (`* { box-sizing: content-box !important }`, global `input`, `label` and `button` rules) takes visual and computed-style snapshots of the demo fixture and compares them with a clean page.
- NFR-C-07: the demo page is served with `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'` in Chromium, Firefox and WebKit. The test fails on any `securitypolicyviolation` event and asserts that computed styles are applied, not merely that no errors occurred.
- Lint: in `packages/element/src`, ban `document.createElement("style")`, `setAttribute("style", …)` and writes to `.style`.
- AC-09.3.1: remove and re-insert the element 100 times; assert that the listener count and the answers are unchanged.
- The DOM contract suite (ADR-0007) asserts that every `aria-describedby` and `aria-labelledby` id resolves within the same root.

**Follow-ups**
- **Form-associated element** (`static formAssociated = true` with `ElementInternals.setFormValue`, also Safari 16.4+) would let an embedder's `<form>` submit the emitted response as JSON with no JavaScript. It is valuable for EMB but not in requirements; it is raised as `05-architecture.md` §9 AT5.

**Amendment note, accepted 2026-09-25 (`06-roadmap.md` M7 plan D2, D5–D7): the element's surface.** None of these changes the decision; they fill in what it names without specifying.
- **Inputs (D5).** Properties `questionnaire`, `session`, `resolver`, `locale`, `timeZone`, `messages` and `controls`; attributes `src` and `value-set-base` (ADR-0012), and `lang`, read from the element or its nearest ancestor that has one. There is no `options` property: a host that needs rules, scorers or a sanitizer creates the session itself and sets `session`.
- **Events (D5).** All are `CustomEvent`s dispatched on the element, and every `detail` is a plain object. `fhirq-change` and `fhirq-complete` carry the emitted `QuestionnaireResponse` without `authored`, as the React adapter's callbacks do. `fhirq-error` means the questionnaire could not be loaded; it carries the error verbatim and the form stays empty. `fhirq-diagnostic` carries a core `Diagnostic`, such as ADR-0013's `control-contract`. They are typed by an `HTMLElementEventMap` augmentation, not by exported types.
- **Completion (D2).** The element renders no submit control, since the view has none. The host's own button calls `requestCompletion()`, a method on the element. A host already writes script to listen for `fhirq-complete`, so this costs the embedder no new kind of code.
- **What replaces a session (D6).** A new `questionnaire`, `src` or `session` value makes a new session, and a session the element created is disposed; setting the same value again does nothing. The lazy creation and the survival across disconnect above are unchanged. A new `locale`, `timeZone` or `messages` builds a new view over the same session and drops typed drafts. `lang` is read on connect and when the element's own `lang` changes; ancestors are not observed.
- **Part names (D7).** "The `part` names are the same as the DOM contract's class names" holds for the error summary too: its parts are `summary`, `summary-heading`, `summary-list`, `summary-entry` and `summary-link`, which is what `08-dom-contract.md` §2 now says. Before M7 the summary carried `error-summary*` parts, which no release published.
- **Tier 3** is keyed by control kind, not item type (ADR-0013 note, 2026-09-24).
