# ADR-0020 — Values are formatted in the view model from an explicit locale

- **Status:** Accepted
- **Date:** 2026-09-16
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** AC-08.3.1, AC-08.3.2, AC-10.3.1, AC-11.2.2 · NFR-I-01, NFR-I-03, NFR-I-04, NFR-C-08, NFR-Q-01, NFR-Q-03, NFR-S-02, NFR-U-05, NFR-M-06 · INV-P-01, INV-P-02 · BC6 · `05-architecture.md` §4.1, §6.1 · ADR-0007, ADR-0008, ADR-0012, ADR-0013, ADR-0015 · closes the architecture half of `03-nfr.md` §12 #9

## Context

NFR-I-04 is a gate: date, number and unit formatting is delegated to `Intl` with a host-supplied locale, and there is zero custom formatting logic. It fixes *what* formats. It does not say **which layer formats, or where the host supplies the locale** — no document does, which is why `03-nfr.md` §12 #9 is open.

Three things are already fixed and constrain the answer. ADR-0007 gives the presentation model "a settled session plus presentation options such as the id prefix", and lists the message catalogue among what layer 2 knows: `view/` already turns host-supplied internationalisation input into user-facing text — the announcement, the error summary, label and help text. ADR-0007 also requires renderers to "stay mechanical". And ADR-0008 already anticipates "the date parsing within `Intl` limits" as hand-written code the maintainer owns and must test.

**The constraint that makes this hard is that FHIR dates are not `Intl` inputs.** `date`, `dateTime` and `time` are distinct types. A `date` carries authored precision — `2024`, `2024-05` and `2024-05-01` are all valid and mean different things. `date` and `time` carry no timezone at all. `Intl.DateTimeFormat` formats an instant, and every route from a FHIR `date` to an instant passes through a timezone. A `date` of `2024-05-01` pushed through a `Date` and formatted in the environment's zone renders as 30 April everywhere west of Greenwich. On a clinical intake form that is a wrong date of birth, silently.

So this is not a call-through. It is branching on precision, and formatting without a timezone round-trip, in code with a patient-safety edge.

**The second constraint is server rendering.** AC-08.3.2 fails the build on any hydration warning, on React 18 and 19. ADR-0015 settled option resolution by a single rule: nothing in the first render depends on the client, which is why value-set items render pending on both server and first client render. A locale read from `navigator.language` breaks that rule in exactly the same shape — the server has no `navigator`, so server and client format differently and the build fails.

## Options considered

**A. The engine formats, with the locale as session configuration.** Rejected. It puts presentation state in the session, so changing locale would mean mutating or recreating one, which contradicts INV-P-01 — presentation holds no domain state, and switching tier, theme or override leaves the session unchanged. The engine's own output is the `QuestionnaireResponse`, whose values are FHIR-typed strings that must stay exact for emission (ADR-0010); a formatted string has no consumer there.

**B. Each renderer formats.** Rejected. The precision branching and the no-timezone rules would be written twice, and the two copies would drift — drift here is a wrong date in one renderer only. It is ADR-0007's own rejection of option A restated: the logic would sit in adapter packages under NFR-Q-02's 85/80 rather than NFR-Q-01's 95/90, and outside the NFR-Q-03 mutation gate. It also costs the bytes twice, once against `@fhirq/react`'s 6 kB and again inside `@fhirq/element`'s 24 kB, which already contains `view/`. And a renderer that selects `Intl` options per precision is computing presentation, which ADR-0007 forbids it.

**C. A formatter port on BC5, alongside the resolver, scorer, evaluator, sanitiser and catalogue.** Rejected for v1. It publishes a seventh interface against NFR-U-05's 60-symbol cap, and commits the kit to its shape under semver before any host has tested it. It also moves server/client determinism onto the host, where the kit's gate cannot see it, and it invites precisely the hand-written formatting NFR-I-04 exists to ban. A host that needs full control of one control's rendering already has tier 3 (ADR-0013), which hands over `node.value` and takes the markup with it.

**D. `view/` formats, from a locale supplied as a presentation option.** Chosen.

## Decision

**The locale is a presentation option, not session state.** `view/` extends the options object ADR-0007 already defines:

```ts
interface ViewOptions {
  idPrefix: string;
  messages?: MessageCatalogue;
  locale: string;      // BCP 47, e.g. "en-GB"
  timeZone?: string;   // IANA, e.g. "Europe/Berlin"
}
```

`view/` reads no ambient source: not `navigator`, not `Intl.DateTimeFormat().resolvedOptions()`, not `process.env.TZ`. Formatting is a pure function of `(value, locale, timeZone)`.

**Every view node carries both the domain value and its formatted string** — `value` unchanged, plus `display`. Tier-3 overrides receive both through `ControlProps` (ADR-0013) and may ignore `display` entirely; the kit's own controls render it.

**Formatting rules by type:**

- **`date`** is formatted at its authored precision: `2024` yields the year alone, `2024-05` the year and month, a full date the whole date. The instant is constructed at UTC midnight and formatted with `timeZone: "UTC"`, so no offset can move the day.
- **`time`** names a wall clock and is never converted. It is formatted from a UTC instant with `timeStyle`, and `timeZone` does not apply to it.
- **`dateTime`** keeps the offset it was authored with. It renders in `timeZone` when the host supplies one, otherwise in its own offset — never in the environment's zone.
- **`decimal` and `integer`** use `Intl.NumberFormat`. A `decimal`'s trailing zeros are significant in a clinical value, so `minimumFractionDigits` comes from the scale of the authored string, not from the parsed number: `0.50` renders as `0.50`.
- **`Quantity`** formats the number with `Intl.NumberFormat` and appends the authored `unit` display string verbatim. UCUM codes are not `Intl` unit identifiers, and a mapping table between them would be custom formatting logic of exactly the kind NFR-I-04 bans.

**`Intl` is ECMA-402, a language built-in, not a DOM global.** The NFR-M-06 "no DOM in core" rule allowlists `Intl` explicitly, so the rule does not have to be weakened to let this through.

**The renderers keep ADR-0012's asymmetry.** `@fhirq/element` reads `lang` from itself or its document, falling back to `navigator.language` and then `"en"`, with a `locale` property overriding all of it — a script tag has nowhere else to say it. `@fhirq/react` takes `locale` as an option and defaults to the fixed string `"en"` when omitted. It never sniffs, so server and client agree by construction, and NFR-I-03 ships one built-in locale anyway.

**Formatter instances are cached** in a module-level `Map` keyed by `(kind, locale, timeZone)`. Constructing `Intl.DateTimeFormat` is expensive relative to a keystroke (NFR-P-03).

## Consequences

**Benefits**
- **The precision and timezone rules are written once,** in a DOM-free module tested in Node under the core coverage and mutation gates — the strongest gates in the project, and the right ones for code whose failure mode is a wrong date of birth.
- **SSR is safe by construction, not by care.** Because `view/` reads nothing ambient, there is no way to write a first render that differs between server and client. This is ADR-0015's rule applied to a second collaborator.
- **No new public interface.** Two option fields and one view-node field, against NFR-U-05's cap; no seventh port, and nothing committed to under semver before a host has used it.
- **Tier 3 is unaffected.** An override gets the domain value and formats it however its design system wants.

**Costs accepted**
- **The host must thread the locale through.** A host that passes the wrong one gets consistently wrong output and no warning, because the kit has no ambient source to check it against. That is the price of determinism, and it is the same trade ADR-0012 made for resolvers.
- **ICU version skew survives this decision.** The same locale can format differently between a Node build's ICU and a browser's, so a server/client mismatch remains possible even with an identical locale string. The mitigation is pinning full-ICU in the SSR gate; hosts running small-icu Node get English regardless of what they pass.
- **A module-level cache is global mutable state** in a package that otherwise has none. It is a pure memo — same key, same formatter — but it is state, and it is the one place in core where a leak would accumulate across sessions. Its keys are bounded by the locales a host actually uses.
- **`display` costs a string per changed node per cycle,** in bytes and in allocation, against NFR-S-02 and NFR-P-03. It is computed only for nodes that changed, per ADR-0007's identity rule.
- **No per-item format override ships in v1.** A host wanting a different date format for one item uses tier 3 and renders that control itself.

**Verification**
- Lint (NFR-M-06): `Intl` is allowed only under `view/format`; `navigator`, `Intl.…resolvedOptions` and `process.env` are banned in core; `toLocaleString`, `toLocaleDateString` and `toLocaleTimeString` are banned everywhere in core, because each one takes the locale from the environment and so defeats the decision while looking like compliance.
- A `date` of `2024-05-01` formatted under `TZ=Pacific/Kiritimati` and under `TZ=Etc/GMT+12` renders 1 May in both. The same test covers `2024` and `2024-05` rendering at their authored precision.
- A property test asserts formatting is a pure function of its inputs: for a fixed locale set, output is unchanged when `process.env.TZ` is mutated between runs.
- `0.50` renders with both decimal places; `0.5` renders with one.
- The AC-08.3.2 SSR gate is extended to a fixture containing dates, decimals and quantities, server-rendered under one timezone and hydrated under another, failing on any console warning in React 18 and 19.
- A conformance-matrix row records partial-precision date rendering, with this ADR as its reason.

## Follow-ups

**`display` under ADR-0007's review rule: resolved 2026-09-17 (M1 AC-3 review).** `display` is also a CSS property, and ADR-0007's checklist fails a view-model field that names one. The name stands and is allowed as a coincidence, as `label` and `clear` are: here it means formatted text, which is FHIR's own sense of the word (`Coding.display`), not styling. M5 adds it to `ALLOWED_COINCIDENCES` in `packages/core/test/deny-lists.ts`, with this ADR as the reason, in the change that adds the field.

The **product half of `03-nfr.md` §12 #9 stays open**: which locale the packages should default to, and whether NFR-I-03's single built-in locale is the right call for a clinical buyer operating outside English. Neither changes this decision — they choose a default for a parameter this ADR makes explicit. Closing them needs a product answer, not an architectural one.

**Amendment note, 2026-09-23 (`06-roadmap.md` M5 plan D7): a decimal's scale.** The decision says a `decimal` takes `minimumFractionDigits` "from the scale of the authored string". The engine stores a decimal answer as a `number` (`04-domain.md` §3.2), so once an answer is set, hydrated or restored, `0.50` and `0.5` are the same value and the scale is gone. M5 formats from the text the respondent typed while the view holds it as a draft, and from the number otherwise. `0.50` typed shows `0.50`; the same answer in a new view, or after a restore, shows `0.5`. Carrying the lexical string in the engine's decimal `Answer` would touch the kernel, the parser, the codec, emission, comparison and M3's round-trip property. That is an ADR-level change outside M5, recorded as a follow-up and as the conformance-matrix row `presentation.decimal-scale` (`partial`). The Verification line "`0.50` renders with both decimal places" holds for typed text (`packages/core/test/view/format.test.ts`).

**Amendment note, 2026-09-24 (M6 plan step 8): ICU skew is tolerated in the adapter, not only pinned in the gate.** The consequence "ICU version skew survives this decision" is not rare. The SSR gate renders on Node and hydrates in both Playwright engines. Node (ICU 78.3, CLDR 48) and Chromium format alike in every locale tried. WebKit uses the system's ICU data and joins a date and a time with "at" in `en`, `en-GB` and `fr` ("May 1, 2024 at 11:30 PM" against Node's "May 1, 2024, 11:30 PM"), and words even a `date` differently in `ar`. With the same locale and timezone, a calculated `dateTime`, or an issue naming a date limit, therefore failed hydration in Safari: React logged the mismatch and discarded the server markup. Pinning full-ICU in the gate would keep the gate green and leave every Safari user of a server-rendered host with the failure, so the mitigation changes. `@fhirq/react` sets `suppressHydrationWarning` on each element whose text holds a value `view/` formatted with `Intl`: the calculated value, an issue message, a summary entry and its link, a repeat instance's name, its remove control, and the reason the add control is inert (`packages/react/src/ui/parts.tsx`, `FORMATTED`). React 19 then keeps the server's wording until the node next changes, and React 18 puts in the browser's own; neither warns nor discards the markup. Every string is still `Intl`'s from the host's locale, so the decision stands; what the adapter gives up is byte-identical text across runtimes, which no formatting choice in `view/` could promise. The element renders on the client only and is not affected. The Verification line on the SSR gate holds in both engines on React 18 and 19 (`tests/browser/hydration.spec.ts`, formats page), and emptying `FORMATTED` fails it in WebKit on both.
