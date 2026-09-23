# ADR-0013 — Four customization tiers, each stopping at a layer boundary

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** Brief §3, §5 · E10 (AC-10.1.1, AC-10.2.1, AC-10.3.1, AC-10.4.1), AC-08.2.1, AC-09.2.2, AC-12.4.1, AC-11.2.2 · NFR-U-01, NFR-U-02, NFR-U-03, NFR-U-05, NFR-A-03, NFR-I-05, NFR-S-02, NFR-C-07 · INV-P-01, INV-P-02 · ADR-0007 · NFR-M-05 topic *customization tier model*

## Context

The primary user already owns a design system and "will not accept a library that fights it" (Brief §3). Adoption needs differ by team, and the need usually grows over time: a team starts on defaults, adopts its colours, replaces one control (typically the date picker), and eventually may render everything itself. Most form libraries offer only the two ends, fully styled or fully headless, so a team that outgrows the defaults faces a rewrite.

The four tiers are fixed by the brief: **defaults → tokens → slots → headless**. What architecture must decide is what each tier *is*, mechanically, in both renderers, so that:
- moving up a tier never forces rewriting the previous tier's work;
- switching tier never touches the session (INV-P-01, AC-12.4.1);
- the accessibility guarantee degrades predictably rather than silently.

## Options considered

**A. Two tiers: styled component and headless hook.** Rejected. It is the gap the brief identifies. A team that needs its own date picker has to leave the default UI entirely and re-implement every accessibility behaviour.

**B. Class-name injection instead of tokens** (`classNames={{ label: "my-label" }}`). Rejected as tier 2. Visual properties would come from host CSS classes applied on top of the kit's structural CSS, so every override becomes a specificity contest with the kit's styles. The element's shadow DOM also blocks host classes (ADR-0014). Custom properties cross the shadow boundary and have no specificity.

**C. Render props for every sub-part** (label, help, error, control, group header). Rejected as tier 3. Dozens of override points would each need exported types, blowing NFR-U-05, and each would be a place where an override can break ARIA wiring. The need identified is *replacing a control for one item type*.

**D. One tier per layer boundary of ADR-0007.** Chosen.

## Decision

Each tier means "use the kit down to layer N, supply the rest yourself".

| Tier | Host supplies | Kit supplies | React | Element | Accessibility guarantee |
|---|---|---|---|---|---|
| **1. Defaults** | nothing | engine, view model, renderer, structural CSS, default preset | `<Questionnaire>` + `import "@fhirq/themes/default.css"` | `<fhir-questionnaire>` (CSS built in) | Full: gated by NFR-A-01 |
| **2. Tokens** | values for `--fhirq-*` custom properties | everything else | CSS on any ancestor | CSS on the host element; `::part()` for targeted overrides | Full for structure; contrast becomes the host's responsibility, which the docs say explicitly |
| **3. Slots** | a control for one or more item types | engine, view model, renderer for everything else, all item chrome (label, help, errors, group structure) | `controls={{ date: MyDatePicker }}` | `controls` property: `{ date: "my-date-picker" }` (a custom element tag) | Full for chrome. The override must apply the ids it is given, and the kit checks in development that it did |
| **4. Headless** | all rendering | engine; optionally the view model | `useQuestionnaire()` returns session + view | `@fhirq/core` + `@fhirq/core/view` directly | Host's. The view model still provides ids, announcements, error summary and focus targets |

**Tokens.** One documented, flat set of custom properties covering colour (light and dark), type scale, spacing, radius, border and focus ring (AC-10.2.1). Structural CSS in `@fhirq/themes/base.css` reads tokens only; it contains no literal colour or spacing values. Presets in `@fhirq/themes` set token values only. Themes use logical properties throughout (NFR-I-05). No inline styles are emitted by either renderer (NFR-C-07).

**The tier-3 control contract** is the view node from ADR-0007, narrowed to what a control needs:

```ts
interface ControlProps<T extends ItemType> {
  node: ControlView<T>;   // value, options + option state, required, invalid, issues, units
  ids: { control: string; label: string; description: string; error: string };
  set(value: AnswerOf<T>): void;
  clear(): void;
  leave(): void;          // the "blur" command of ADR-0004
}
```

The override renders **the control only**. The label, help text, error text, required marker and error-summary link are rendered by the kit around it, using the same ids. The override's obligations are to put `ids.control` on its focusable element, set `aria-describedby` to `ids.description` and `ids.error`, set `aria-invalid` from `node.invalid`, and call `leave()` when focus leaves. In development builds, the renderer checks after mount that an element with `ids.control` exists and carries those attributes, and logs a diagnostic naming the item type and the missing attribute if not.

**Sessions outlive presentation.** Every tier accepts an existing session (ADR-0015), so switching tier re-renders the same session instead of creating a new one.

## Consequences

**Benefits**
- **Each step up keeps the work done at the previous step:** tokens still apply to a tier-3 form, and a tier-3 control still gets the kit's labels and error wiring.
- **Tier 2 meets NFR-U-02** (≤ 30 lines of CSS, no JavaScript), because a design system's colours, radii and spacing map directly onto tokens.
- **The tier-3 surface is one generic type** instead of dozens of render props, which keeps NFR-U-05 achievable.
- **The playground tier switcher (AC-12.4.1) is not a playground-only code path:** it is the same session rendered four ways.

**Costs accepted**
- **Tier 3 replaces controls, not layout.** A host wanting a different label position or group layout within the kit's renderer has no override point short of tier 4. This is a deliberate limit on the API surface; `::part` and tokens cover common layout tweaks.
- **Element tier 3 needs JavaScript.** Mapping an item type to a custom element tag is a property, not an attribute, and the host must define that custom element. EMB without JavaScript gets tiers 1 and 2 only.
- **Contrast is not guaranteed at tier 2.** NFR-A-03 is gated for the kit's presets only. The docs provide the token pairs that must meet 4.5:1 and 3:1 so hosts can check their own values.
- **A development-only ARIA check** adds code that must be stripped from production builds (a `process.env.NODE_ENV` or `import.meta.env.DEV` guard, handled by consumers' bundlers; the element's IIFE is built without it).

**Verification**
- AC-10.2.1 sentinel test: render the demo fixture with every token set to a sentinel value in both renderers, and assert that no computed style still holds a default preset value.
- A lint or stylelint check that `base.css` contains no literal colours or lengths other than `0` and relative units derived from tokens, and no physical-direction properties (NFR-I-05).
- Tier-3 test per renderer: override `date` with a minimal accessible control, and assert that label association, error association and `aria-invalid` hold; override with a control that omits `id`, and assert that the development diagnostic names `date` and `id`.
- The NFR-A-01 automated gate runs across all four tiers, using the reference tier-3 and tier-4 implementations from the playground.

**Amendment note, accepted 2026-09-23 (`06-roadmap.md` M5): what `set` takes.** The Decision's sketch types `set(value: AnswerOf<T>)`. M5 builds `ControlProps<K>` with `set` taking what the control holds:
- **typed text for entry kinds** (text, numbers, dates, the quantity's value). A date or number being typed is not a value yet, and INV-P-06 keeps it out of the engine, so `set` cannot take the answer type (M5 plan D3);
- **an option key for option kinds** (`yes-no`, the choice kinds, a quantity's unit). A key is a string, so a renderer or an override writes it as a DOM `value` and passes it back as read, and never maps a key to an answer itself.

The domain value stays on the node as `node.value` (ADR-0020), so an override that wants the answer type reads it there. The obligations (`ids.control`, `aria-describedby`, `aria-invalid`, `leave()`) and the development check are unchanged. The typed-text half follows from M5 plan D3; the option-key half was M5's own choice, accepted with it.
