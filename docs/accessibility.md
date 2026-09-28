# Accessibility record

The kit's accessibility claim is WCAG 2.2 at A and AA (`03-nfr.md` §5). This
record is the evidence behind it, for an integrator's own QA (AC-11.5.2). It
has four parts:

1. what the build checks on every change;
2. the manual screen-reader passes, with the script they follow and a dated
   record of each;
3. every WCAG 2.2 A and AA criterion, and what checks it;
4. every known gap (NFR-A-09).

Automated checks find roughly a third of real accessibility problems. The
manual passes are the other part of the claim, not an extra (NFR-A-02).

**Status, 2026-09-28.** The automated gates pass on `main`. The three manual
passes have **not been run yet**. Until they have, this record claims only
what the automated gates show, and M8 stays open (`06-roadmap.md` M8, D9).

---

## 1. Automated evidence

Every gate below fails its CI job when it fails. Most run in the
`Accessibility gates` job, which becomes a required check when it is added
to branch protection. That job uploads the axe report
(`reports/a11y/index.html`) and the pass pages (§2.1) as its
`accessibility` artifact, whether or not it passes.

| Gate | What it checks | Breadth | Where |
|---|---|---|---|
| Axe matrix | 0 violations of axe's WCAG 2.0, 2.1 and 2.2 A and AA rules (NFR-A-01, AC-11.5.1) | 2 forms (the demo, the form of every kind) × 3 states (loaded, answered, completion refused) × light and dark × 375 and 1280 px × tiers 1–3 in both renderers and tier 4 in React: **168 runs**, Chromium, React 19 | `tests/browser/a11y-matrix.spec.ts`; report by `pnpm a11y:report` |
| Axe on shipped pages | The same rules on the element's demo and `examples/element-embed`, loaded and refused; the React quickstart and demo, hydrated and refused | Element in Chromium, Firefox and WebKit; React 18 and 19 in Chromium | `element-a11y.spec.ts`, `react-a11y.spec.ts` |
| Contrast, as drawn | Every text 4.5:1, or 3:1 when large; every control boundary, error bar and radio or checkbox accent 3:1 against what it sits on (1.4.3, 1.4.11, NFR-A-03) | Tier 1, both forms, 3 states, light and dark, both renderers, 3 engines | `visual-a11y.spec.ts` |
| Contrast, the preset | Text, control, error, link, border and focus colours against their backgrounds, computed from `default.css`'s tokens by WCAG's formula | Light and dark | `packages/themes/test/stylesheets.test.ts` |
| Focus | Every focusable part shows an outline at least 2 px wide and 3:1 against what it sits on (2.4.7, NFR-A-04), light and dark; also in forced colours | Tier 1, both forms, answered and refused, both renderers, 3 engines; forced colours in Chromium only (gap G1) | `visual-a11y.spec.ts` |
| Targets | Every target at least 24 px or clear of its neighbours by WCAG's spacing exception (2.5.8); text entries, selects, whole choice rows and the add, remove and retry buttons at least 44 px (NFR-A-05, plan D8) | Tier 1, both forms, 3 states, both renderers, 3 engines | `visual-a11y.spec.ts` |
| Reflow | No horizontal scroll and no part past the viewport at 320 × 256 CSS px, which is what 1280 × 1024 at 400 % gives (1.4.10, NFR-A-06) | Tier 1, both forms, 3 states, both renderers, 3 engines | `visual-a11y.spec.ts` |
| Motion | No transition or animation on any part, with reduced motion and without (2.3.3, AC-11.4.2) | Tier 1, both forms, both renderers, 3 engines | `visual-a11y.spec.ts` |
| RTL | Under `dir="rtl"` every part's box mirrors its `ltr` box, and the ARIA snapshot is unchanged (NFR-I-05) | Tier 1, both forms, 3 states, both renderers, 3 engines | `rtl.spec.ts` |
| Logical properties | No physical-direction property, literal colour or length in `base.css` (NFR-I-05, M8 AC-3) | Every theme stylesheet | stylelint in `pnpm lint` |
| Tokens | Every token set to a sentinel reaches the form and leaves no preset value, light and dark (AC-10.2.1) | The demo, both renderers, 3 engines | `tokens.spec.ts` |
| Print | Print keeps answers, repeat instances and errors, drops the screen-only controls, and prints the light scheme | The demo, both renderers, 3 engines | `print.spec.ts` |
| Tier 2 | A host's design system reaches the form through one stylesheet of at most 30 lines (NFR-U-02) | Both renderers, light and dark, 3 engines | `themed-host.spec.ts` |
| One DOM contract | Both renderers produce the same elements, roles, ARIA attributes and accessible names, with every id reference resolved in its own tree | The demo, 3 states | `contract.spec.ts` |
| Focus and caret | Typing never loses focus or caret across updates, including through shown, hidden, added and removed items | The element, every entry kind, 3 engines | `caret.spec.ts` |
| Focus moves | After a refused completion focus goes to the error summary, and a summary link focuses its control; an added instance focuses its first control; a removed one focuses its neighbour | Both renderers | `packages/react/test/browser/ui.test.tsx`; `element.test.ts` and `kinds.test.ts` in `packages/element/test/browser/` |
| Announcements | At most one message per update, naming what changed and how many (AC-11.3.2, INV-P-03) | The view model | `packages/core/test/view/announce.test.ts` |
| Pass pages | The pages the manual passes use (§2.1) load under their CSP with nothing on the console, have 0 axe violations, and refuse an empty form to the summary | 4 pages, 3 engines | `pass-pages.spec.ts` |

The matrix pages, the tier-3 controls and the tier-4 headless page are in
`tests/browser/pages/`. Axe-core is 4.13.0.

---

## 2. Manual screen-reader passes

The pairs are fixed by NFR-A-02 (confirmed 2026-09-16, `03-nfr.md` N11):

| Pair | Platform | Why this pair |
|---|---|---|
| NVDA + Firefox | Windows | What an evaluator can reproduce for free |
| JAWS + Chrome | Windows | What the buyer's own accessibility team runs. JAWS needs a licence or its 40-minute demo mode |
| VoiceOver + Safari | iOS | Also covers the Safari 16.4 floor (A4) |

Each release runs all three, following the script below, and adds a dated
row to §2.4. Findings that are failures go to §4 until fixed.

### 2.1 The pages

`pnpm a11y:pages` writes four static pages to `reports/a11y/pages/`: the
element and React, each with the demo and the form of every kind. Each page
is a production build under the CSP a host sets. The form sits inside a host
form whose **Submit** button asks it to complete, as the quickstart does. The
pages add no status message of their own, so every announcement you hear
comes from the kit. The same pages come with each CI run's `accessibility`
artifact.

To reach them from a Windows machine or an iPhone on the same network:

```sh
pnpm a11y:pages
python3 -m http.server --bind 0.0.0.0 --directory reports/a11y/pages 8000
```

Then open `http://<this machine's address>:8000/` on the device. The index
links all four pages.

The demo is `fixtures/demo`. The form of every kind has one item of each
kind the kit draws. Its value set cannot load, so it also shows the retry
control. Neither form is for clinical use.

### 2.2 Before you start

Record the following for the row in §2.4:

- the date;
- who ran the pass;
- the screen reader, browser and OS versions;
- the commit the pages were built from (`git rev-parse --short HEAD`, or the
  CI run the artifact came from).

Use the screen reader's default settings and verbosity, with the browser at
100 % zoom.

### 2.3 Script

Run steps 1–11 on **the element, the demo**. Then run steps 1–4 and 6–8 on
**React, the demo**, and steps 9–11 on both pages of the form of every kind.
Each step names the criteria it checks and what you should hear or see.
Record anything different, even when it seems minor.

1. **Page structure** (1.3.1, 2.4.6). Move through the page by headings and
   by landmarks or regions.
   - Expected: the page's level 1 heading, then the form's groups ("About
     your visit", "Pain", "Measurements", "Smoking", "Medicines you take",
     "Allergies", "How you have been feeling"), each read as a group with its
     name.
   - The one medicine instance is a region named "Medicines you take 1",
     with a level 3 heading of the same name.
2. **Keyboard only** (2.1.1, 2.1.2, 2.4.3, 2.4.7, NFR-A-07). With the screen
   reader off (desktop pairs only), Tab from the top of the page to Submit,
   then Shift+Tab back to the top.
   - Expected: every control is reached in the order it is drawn, and no
     control holds focus.
   - Each radio group is one Tab stop. The arrow keys move within it and
     select as they move.
   - The focus ring is always visible.
3. **Names, roles and states** (1.3.1, 3.3.2, 4.1.2, 2.5.3). With the screen
   reader on, move to each control in turn, in its forms or focus mode.
   - Expected: each control is read with its question text, its role, and
     "required" where the label shows `*`.
   - A radio group reads its question as the group name, then the choice.
   - The `*` itself is not read.
   - Weight's unit field is read as "Unit". Record whether that is enough to
     know which question it belongs to (gap G17).
4. **Questions that appear and disappear** (4.1.3, AC-11.3.2, NFR-A-08).
   Answer "Are you in pain today?" with **Yes**, then **No**. Then answer
   "Do you smoke?" with **I smoke now**.
   - Expected: after each answer, **one** polite message: "1 question
     shown." (pain score), "1 question hidden.", then "1 question shown."
     (cigarettes a day).
   - The message comes within about half a second, and does not interrupt
     what was being read.
   - Record the exact text and the number of messages.
5. **Values read back** (4.1.2). Type into a text field, choose a radio,
   then leave each control and come back to it.
   - Expected: the current value or the selected choice is read.
6. **Repeats** (2.4.3, 4.1.3, AC-03.2.1, AC-03.2.2, AC-11.2.1). Activate **Add Medicines
   you take**.
   - Expected: focus moves to the new instance's first field, "Name of the
     medicine", inside the region "Medicines you take 2", and one message
     says "1 section added.".
   - Then activate **Remove Medicines you take 2**. Focus moves to a
     neighbouring instance's first field, or to the add button, and one
     message says "1 section removed.".
7. **A refused completion** (3.3.1, 2.4.3, AC-11.3.1). With the two
   questions under "About your visit" still empty, activate **Submit**.
   - Expected: one message, "The form was not completed. 2 answers need
     attention.", and focus moves to the region "There is a problem", whose
     heading is read.
   - The list holds two links: "Date of your appointment: Answer this
     question" and "What is the main reason for your visit?: Answer this
     question".
8. **An error, focused** (3.3.1, 3.3.3, AC-11.2.2). Activate the first link
   in the summary.
   - Expected: focus moves to "Date of your appointment". It is read as
     required and invalid, with the error "Answer this question".
   - Then type `2024-13` and leave the field. One message says "1 answer
     needs attention.", and the field has two errors: "Answer this
     question", since text that is not a date is not an answer yet, and
     "Enter a real date, like 2024-05-01, 2024-05 or 2024". Record whether
     the pair reads clearly.
   - Then type `2024-05-01` and leave. The error is gone and the field is
     no longer invalid.
9. **Every kind** (1.3.1, 4.1.2), on the form of every kind. Move through
   every control.
   - Expected: each is read with its name and a role that fits its kind:
     text field (dates and numbers too), list box, combo box, check box or
     radio.
   - "About you" is read as text, and "Upload" as a question with "This
     question cannot be shown here".
   - The medicine instance holds a nested group "Time" with an instance
     "Time 1" (level 4 heading).
   - Activate **Add Medicine** once. "Medicine" allows two, so the add
     button is then read as unavailable, or dimmed, with its reason, "You
     can add up to 2.". It can still be focused (INV-P-04).
   - Record how each date and number field reads its value back.
10. **Choices that fail to load** (4.1.3, AC-07.1.2), on the form of every
    kind, just after it loads.
    - Expected: one message, "Choices could not be loaded for 1 question.".
    - "Coded" shows "The choices could not be loaded" and a **Try again**
      button, which can be reached and activated. Activating it fails again.
      Record what is announced.
    - Record what is read for the "Coded" group, which has no choices while
      the lookup has failed (gap G18).
11. **A calculated value** (4.1.3, NFR-A-08), on the form of every kind.
    - Expected: "Score" is read with its value, "Score unavailable".
    - Record whether it is announced on its own, and whether answering other
      questions ever makes it speak in addition to the kit's message (gap
      G11).

**Visual checks**, once per release, on the desktop pairs and the iPhone,
with the screen reader off:

12. **Text resize** (1.4.4). Zoom the page to 200 %, and on the desktop
    also to 400 % at 1280 px wide.
    - Expected: nothing is cut off or overlaps, and there is no horizontal
      scroll except at 400 %, where the form reflows to one column.
13. **Text spacing** (1.4.12). Apply WCAG's text-spacing values (line height
    1.5, paragraph spacing 2, letter spacing 0.12, word spacing 0.16 em)
    with a bookmarklet or the browser's reader styles.
    - Expected: no text is cut off or overlaps.
14. **Forced colours** (1.4.11, AC-11.4.2), Windows only. Turn on a contrast
    theme and check both pairs' browsers.
    - Expected: every control's boundary, the focus ring, the checked radio
      and checkbox, the error bar and the inert add button are all still
      visible.
15. **Dark mode and orientation** (1.3.4, AC-11.4.2), on the iPhone. Turn
    on dark mode, and turn the phone to landscape and back.
    - Expected: the dark colours apply, and the form works in both
      orientations.

### 2.4 Record

One row per pair and release. **Result** is *pass* (every step as
expected), *pass with notes* (every step as expected, with remarks in
**Findings**), or *fail* (a step not as expected: the finding is also
listed in §4).

| Date | Pair | Versions (reader, browser, OS) | Build | Tester | Steps run | Result | Findings |
|---|---|---|---|---|---|---|---|
| — | NVDA + Firefox, Windows | — | — | — | — | **Not yet run** | — |
| — | JAWS + Chrome, Windows | — | — | — | — | **Not yet run** | — |
| — | VoiceOver + Safari, iOS | — | — | — | — | **Not yet run** | — |

---

## 3. WCAG 2.2 A and AA criteria

What checks each criterion, for the kit's form. **Automated** names a gate
in §1. **Manual** names a step in §2.3. **Host** means the criterion is
about the page or product around the form, which the kit does not draw.
**n/a** means the kit draws nothing the criterion applies to. A criterion
with a gap names it.

| Criterion | Level | Checked by | Notes |
|---|---|---|---|
| 1.1.1 Non-text Content | A | Automated (axe); Manual 1, 3 | The kit draws no images. The required marker is hidden from assistive technology and stated as `aria-required`. Images in authored rich text are the author's (G14) |
| 1.2.1–1.2.5 Time-based media | A, AA | n/a | The kit plays no audio or video |
| 1.3.1 Info and Relationships | A | Automated (axe, DOM contract); Manual 1, 3, 9 | Groups are fieldsets, instances are named regions, radio sets are radiogroups, and errors are linked by `aria-describedby` |
| 1.3.2 Meaningful Sequence | A | Automated (RTL, DOM contract); Manual 2 | DOM order is visual order in both directions |
| 1.3.3 Sensory Characteristics | A | Manual 3 | Every message names its question. None refers to shape, colour or position |
| 1.3.4 Orientation | AA | Automated (reflow); Manual 15 | No orientation lock |
| 1.3.5 Identify Input Purpose | AA | — | **Gap G12**: the kit sets no `autocomplete` |
| 1.4.1 Use of Colour | A | Manual 7, 8, 14 | Errors carry text and a bar; required carries a marker and `aria-required` |
| 1.4.2 Audio Control | A | n/a | |
| 1.4.3 Contrast (Minimum) | AA | Automated (contrast, as drawn and in the preset; axe) | Tier 1. Tiers 2–4 have axe only (G4) |
| 1.4.4 Resize Text | AA | Manual 12 | Sizes are in `rem`, so a user's font-size setting scales the form. **Gap G2**: not automated |
| 1.4.5 Images of Text | AA | n/a | |
| 1.4.10 Reflow | AA | Automated (reflow); Manual 12 | 400 % is emulated by a 320 px viewport (G2) |
| 1.4.11 Non-text Contrast | AA | Automated (contrast, focus); Manual 14 | Forced colours in Chromium only (G1). The inside of a radio or checkbox is the platform's (G3) |
| 1.4.12 Text Spacing | AA | Manual 13 | **Gap G2**: not automated |
| 1.4.13 Content on Hover or Focus | AA | n/a | The kit shows nothing on hover or focus |
| 2.1.1 Keyboard | A | Automated (axe); Manual 2 | **Gap G10**: no automated keyboard walk |
| 2.1.2 No Keyboard Trap | A | Manual 2 | **Gap G10** |
| 2.1.4 Character Key Shortcuts | A | n/a | The kit defines no shortcuts |
| 2.2.1 Timing Adjustable | A | Host | The kit has no time limit. A session timeout is the host's |
| 2.2.2 Pause, Stop, Hide | A | Automated (motion) | Nothing moves, blinks or updates on its own |
| 2.3.1 Three Flashes | A | Automated (motion) | Nothing flashes |
| 2.4.1 Bypass Blocks | A | Host | Groups and instances give landmarks; the page's own skip links are the host's |
| 2.4.2 Page Titled | A | Host | |
| 2.4.3 Focus Order | A | Automated (focus moves); Manual 2, 6, 7, 8 | |
| 2.4.4 Link Purpose (In Context) | A | Automated (axe); Manual 7 | Each summary link names its question and the problem |
| 2.4.5 Multiple Ways | AA | Host | |
| 2.4.6 Headings and Labels | AA | Manual 1, 3 | Labels are the author's question text. **Gap G8**: repeated instance names |
| 2.4.7 Focus Visible | AA | Automated (focus) | Forced colours in Chromium only (G1) |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Host | The kit has nothing fixed or sticky. A host's sticky header can hide focus |
| 2.5.1 Pointer Gestures | A | n/a | Every action is one tap or click |
| 2.5.2 Pointer Cancellation | A | Manual 6, 7 | Native buttons act on release |
| 2.5.3 Label in Name | A | Automated (DOM contract); Manual 3 | Each control's name is its visible label. Speech input is not tested (G15) |
| 2.5.4 Motion Actuation | A | n/a | |
| 2.5.7 Dragging Movements | AA | n/a | Nothing is dragged |
| 2.5.8 Target Size (Minimum) | AA | Automated (targets; axe) | Tier 1. Tiers 2–4 have axe only (G4) |
| 3.1.1 Language of Page | A | Host | |
| 3.1.2 Language of Parts | AA | Host | **Gap G13**: `Questionnaire.language` is not mapped to `lang` |
| 3.2.1 On Focus | A | Manual 2 | Focus changes nothing |
| 3.2.2 On Input | A | Manual 4 | Answers show or hide questions below, and say so (4.1.3). They never submit or move focus |
| 3.2.3 Consistent Navigation | AA | Host | |
| 3.2.4 Consistent Identification | AA | Automated (DOM contract) | One label for each action, from the message catalogue |
| 3.2.6 Consistent Help | A | Host | |
| 3.3.1 Error Identification | A | Automated (axe, focus moves); Manual 7, 8 | |
| 3.3.2 Labels or Instructions | A | Manual 3 | Required is marked and stated. A format hint beyond the error text is the author's |
| 3.3.3 Error Suggestion | AA | Manual 8 | Messages say what to enter, e.g. "Enter a real date, like 2024-05-01, 2024-05 or 2024" |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Host | The kit checks answers before completing. Confirming or reversing a submission is the host's |
| 3.3.7 Redundant Entry | A | Manual 4 | Answers to hidden questions are kept, not asked again (ADR-0011). A questionnaire that asks twice is the author's |
| 3.3.8 Accessible Authentication (Minimum) | AA | n/a | |
| 4.1.2 Name, Role, Value | A | Automated (axe, DOM contract); Manual 3, 5, 9 | Tier 3 controls: G9 |
| 4.1.3 Status Messages | AA | Automated (announcements); Manual 4, 6, 7, 10, 11 | **Gap G11**: delivery and timing are not measured |

2.3.3 Animation from Interactions (AAA) is also checked, by the motion gate.

---

## 4. Known gaps

Complete as of **2026-09-28**. Each gap says who it affects and what a host
can do. None is a known WCAG A or AA failure of the default form. G11, G17
and G18 could turn out to be failures, and the passes settle them.

| # | Gap | Affects | What a host can do |
|---|---|---|---|
| G1 | **Forced colours are emulated in Chromium only.** The focus ring is gated there. Controls, selection, errors and the inert add button are not gated in forced colours in any engine. `base.css` maps them to system colours | Windows contrast-theme users, mainly in Firefox | Manual step 14 checks them |
| G2 | **Zoom is emulated.** Browsers zoom by shrinking the CSS viewport, so 400 % at 1280 px is gated as 320 × 256 CSS px. Browser zoom, text-only zoom (1.4.4) and text spacing (1.4.12) are not automated | Low-vision users | Manual steps 12 and 13 check them |
| G3 | **The inside of radios and checkboxes is the platform's.** The gate checks their accent colour against the background, not the dot or tick the platform draws inside | Low-vision users | Tier 3 can replace the control |
| G4 | **The visual gates and RTL cover tier 1 only.** Tiers 2–4 have axe only. A tier-2 theme's contrast, focus and target sizes are the host's tokens | Users of a re-themed form | Check a tier-2 theme with the same gates: `visual-a11y.spec.ts` reads any page |
| G5 | **WebKit draws a text input 2 px narrower under `rtl`**, with no styling at all. The RTL gate measures this on a bare input and allows for it | Nobody noticeably | — |
| G6 | **RTL is tested with `dir` on the page root and left-to-right text.** `dir` set on the element itself, right-to-left authored text, and mixed-direction text are not tested | Right-to-left users | Set `dir` on the page or a container |
| G7 | **`text-decoration` crosses the shadow boundary.** An underline on an ancestor in normal flow is drawn through the element's text and cannot be reset from inside (ADR-0014, 2026-09-28 note). The six other inherited properties M7 found are reset | Element users on pages that underline a container | Do not set `text-decoration` on an ancestor of the element |
| G8 | **Instance names can repeat.** Nested repeat instances under different parents share a name, such as "Time 1" in "Medicine 1" and in "Medicine 2", so two regions have one name. Every instance is a region, so a long form has many regions. Axe reports this as a best practice, not an A or AA failure. The matrix runs only A and AA rules, so no best-practice rule is gated. Fixing it is view behaviour and is not scheduled | Screen-reader users on nested repeating forms | None short of tier 3 or 4: `instanceLabel` names the group and position, not the parent |
| G9 | **Tier-3 controls are the host's.** In development the kit checks three of a replaced control's duties: `id`, `aria-invalid` and `aria-describedby` (`08-dom-contract.md` §3.9). It cannot check the rest: a name for a control that is not labelable, keyboard operation, the focus ring, contrast, target size, and calling `leave()`. A tier-4 (headless) form's markup is entirely the host's | Users of a host's controls | Run axe and the visual gates on the host's pages |
| G10 | **Keyboard operation has no automated walk.** Reachability rests on native controls with no positive `tabindex` (the DOM contract), on axe's keyboard rules, and on the focus-move tests. No test tabs through a whole form, checks for traps, or checks radio arrow keys. `03-nfr.md` lists NFR-A-07 as a gate, but `06-roadmap.md` §5 gives it no gate row. That mismatch is recorded here, not settled | Keyboard users | Manual step 2 checks it |
| G11 | **Announcements are tested in the view model, not as heard.** At most one message per update is unit-tested. Its delivery by the live region and NFR-A-08's 500 ms are not measured. A calculated item is an `output`, which browsers expose as a live status of its own, so a score change may be announced on top of the kit's message | Screen-reader users | Manual steps 4 and 11 check it. If confirmed, it is a DOM-contract fix of its own |
| G12 | **1.3.5 Identify Input Purpose is not met by default.** The kit sets no `autocomplete`, because a FHIR item does not say whether it asks for the respondent's own name, birth date or address | Users of autofill and personalisation tools | A tier-3 control can set `autocomplete` on the questions that ask about the respondent |
| G13 | **The questionnaire's language is not marked.** `Questionnaire.language` is not mapped to `lang`, so a form in a language other than the page's is read in the page's language (3.1.2) | Screen-reader users on multilingual pages | Set `lang` on the element (which also sets its locale) or on React's container |
| G14 | **Authored content is the author's.** Question text, option text, rich text and any images in it come from the questionnaire. Rich text is shown only through the host's sanitizer (INV-X-06). Alternative text, heading structure inside rich text, and plain wording are the author's | Everyone | Review questionnaires as content |
| G15 | **Only the three pairs are tested.** TalkBack, Narrator, macOS VoiceOver, and speech input such as Dragon or Voice Control are not tested. 2.5.3 rests on names being the visible labels by construction | Users of other assistive technology | — |
| G16 | **The axe matrix runs in Chromium only**, since axe's results do not depend on the engine (plan D4). Firefox and WebKit run axe on the element's demo and embed, and React 18 runs it on the quickstart and demo | — | — |
| G17 | **A quantity's unit field is named "Unit".** It is read as "Unit" without its question when a user moves by form field | Screen-reader users | Manual step 3 checks it. If it is a failure, the fix is view behaviour |
| G18 | **A choice question whose lookup failed is an empty radio group.** While it shows the retry button, the group has no choices | Screen-reader users | Manual step 10 checks it |
| G19 | **Print is checked for what it shows, not how.** The gate checks which parts print, not contrast or page breaks on paper | People printing a completed form | — |
| G20 | **Two figures are still assumptions.** NFR-A-05's 44 px for primary controls and NFR-A-08's one message within 500 ms are `ASSUMPTION`s in `03-nfr.md` §5. They are gated or checked as stated, but have not been confirmed as the right figures | — | — |
