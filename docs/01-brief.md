# FHIR Questionnaire Kit — Product Brief

*Phase: product management. Output of the discovery conversation. Next: business analysis → architecture → milestones → build.*

---

## 1. Purpose and definition of success

This is an open-source library for teams that render FHIR Questionnaires in production clinical software. The repo, playground, docs and ADRs exist so those teams can evaluate and adopt it without contacting the maintainer.

**Primary goal.** Give regulated clinical software teams a FHIR Questionnaire rules engine and renderer they can take through their own dependency, security and accessibility review, instead of building and revalidating an in-house forms engine.

**Success condition.** A team goes from evaluation to a working, reviewed integration using only the published artifacts: the library passes their dependency review, renders their questionnaires correctly or fails with precise diagnostics, and emits responses their downstream systems accept. After the initial release, the project continues at maintenance pace — it is not abandoned, but it stops competing for time.

**Failure conditions.**
- An evaluating engineer reads the repo for ten minutes, concludes the rules engine is too shallow to trust with a clinical form, and builds in-house instead.
- The project grows a support obligation its maintainers cannot sustain.
- A decision in the repo cannot be explained and defended by the maintainer unaided, so an adopter's question about it goes unanswered.

---

## 2. Audience

Before anyone integrates the library, someone on the adopting team evaluates it. Two evaluator types, both of whom must be served by the same published artifacts.

**Evaluator A — technical evaluator on an adopting team.** Architect, tech lead or senior engineer doing due diligence. Clones the repo, reads commit history, opens the ADRs, looks for how tradeoffs were reasoned about. Spends 15–40 minutes. This evaluator is the reason architecture quality, test quality, and written reasoning cannot be deferred.

**Evaluator B — stakeholder shortlisting options.** Product owner, clinical lead or engineering manager. Gives the link 30 seconds to a few minutes, often on a phone, technical but not reading code. Needs to see a working product immediately. The playground and README carry this entirely.

**Implication.** The published artifacts must be simultaneously skimmable and readable. Neither can be traded off against the other, which is what forces the scope decision in §5.

---

## 3. Users

**Primary user: the regulated clinical software team.** Building patient-facing software under a quality system — medical device software, digital therapeutics, regulated telehealth.

Their defining constraints, all of which drive architecture:
- Every third-party dependency must be reviewed and documented. Transitive dependency count is an adoption blocker, not a preference.
- They already own a design system and will not accept a library that fights it.
- They own auth, tenancy, and data residency. A library that does its own HTTP or stores responses is disqualified before evaluation.
- Accessibility must be verifiable, not asserted.
- A questionnaire changing must not require an engineering release — that is the difference between a config change and a revalidation cycle.

**Secondary user: the non-JavaScript shop.** Rails, Django, .NET, or a CMS that needs a clinical form in a page. Served by the web component and script-tag embed. Not optimized for, but explicitly supported — this user is the reason the element exists and the reason it needs a default resolver.

**Explicitly not optimized for.** Questionnaire authors and clinical teams (this renders, it does not author). Teams wanting a hosted service. Anyone wanting a full FHIR client.

---

## 4. Problem and competitive position

A FHIR `Questionnaire` is a form expressed as data: questions, answer types, allowed options, and rules for when each question appears. Because it is an international standard, instruments like PHQ-9 and GAD-7 and hundreds of others are authored once and consumed by any conforming system.

The hard part is not rendering inputs. It is the rules engine underneath: conditional visibility with cascading chains, nested and repeating groups, cross-field validation, scoring, partial save and resume, and a defensible policy for what happens to an answer when its question becomes hidden.

**Why existing options leave the primary user unserved:**

| Option | Why it fails the regulated team |
|---|---|
| LForms (NLM/LHNCBC) | Partial FHIR Questionnaire/SDC support; ships as script files including an Angular runtime (zone.js) — a dependency review burden with no clean npm import story |
| Medplum | Strong and standards-compliant, but the renderer arrives with the platform: questionnaire builder, storage, response workflows, API. Cannot adopt the renderer without adopting the backend — the opposite of a no-PHI boundary |
| MOLIT questionnaire-renderer | Stencil-based, thinly maintained, no layered packaging |
| In-house build | The common path. Teams hard-code three forms, then discover the fourth needs conditional logic |

**Market evidence.** This capability is sold. Teams pay rather than build, and what they are paying for is the rules engine, not the inputs.

**The position:** zero runtime dependencies, no storage, no platform. None of the incumbents offers all three.

---

## 5. Scope

**Shape: one complete solution, narrow in depth.** Not a phased release where phase one is partial. Every layer ships; the spec surface is deliberately bounded.

Width cannot be cut — omitting the element, the themes, the playground, or the docs leaves some adopters without a path for their stack, their design system, or their evaluation. Volume therefore comes out of depth, which is also the safer cut for a regulated adopter: a small, correct, documented subset with an honest conformance table beats broad half-working coverage.

### In scope — the release

**Packages (all four ship):**
- `@fhirq/core` — engine, no DOM, runs in Node
- `@fhirq/react` — React adapter, thin
- `@fhirq/element` — `<fhir-questionnaire>` web component, shadow DOM
- `@fhirq/themes` — token presets

**Artifacts:** live playground; docs site; ADRs; conformance matrix; CI with tests, accessibility checks, and bundle size budget.

**Spec depth — the "middle" line:**
- Common item types (boolean, decimal, integer, date/dateTime, string, text, choice, open-choice, quantity, display, group)
- `enableWhen` including cascading chains; `enableBehavior` any/all
- Nested groups and repeating item groups
- Required, range, and cross-field validation
- Scoring as an extension point, not built into the engine
- Partial save and resume from an existing `QuestionnaireResponse`
- Explicit, configurable answer-retention policy on hide
- Four customization tiers: defaults → tokens → slots → headless
- FHIR R4 only

### Out of scope — with reasoning, published in the conformance matrix

| Excluded | Reasoning |
|---|---|
| FHIRPath expressions | Grinding work, little architectural payoff; a clean extension point is the better answer |
| Terminology server / ValueSet resolution | Resolver injection is the boundary; the host owns it |
| Advanced SDC rendering extensions | Long tail; adds surface without serving the primary user's core need |
| FHIR R5 | R4 is where the deployed base is; version abstraction documented, not implemented |
| Vue adapter | Width is already wide; React establishes the adapter pattern, a second adapter only repeats it |
| Response storage / PHI | Transport is a boundary. No auth, tenancy, encryption, retention, or compliance surface |
| PDF generation | Owning fonts, pagination, and page breaks across repeating groups is a swamp. Emit printable HTML |
| Questionnaire authoring UI | Render, don't author |
| Hosted service, full FHIR client | Not the product |

### Key product decision carried into architecture

**Answer retention on hide: retain internally, exclude from the emitted response. Configurable. Default documented in an ADR.**

Toggling an answer back restores prior input, so accidental work loss is impossible. The emitted `QuestionnaireResponse` contains only answers to questions the patient was actually shown — critical, because a downstream system scoring a PHQ-9 must not include an item never asked. This forces a real separation between engine state and emitted document, which must be structural and recorded in an ADR.

Write the ADR from first principles. Do not cite behaviour of other systems that adopters cannot verify for themselves.

---

## 6. Design principles

Everything in the build traces to one of these. Anything that traces to none of them gets cut.

1. **Deliberate boundaries.** No PHI, no PDF, no authoring, no hosted service — and each exclusion is documented with the reason it makes the library easier to adopt rather than leaving a gap.
2. **Designed for constraints the adopter does not control.** Zero dependencies because of dependency review. Resolver injection because the host owns auth, retries, caching, and offline. Decisions justified by the adopter's constraints, not developer taste.
3. **Correct layering.** Logic separated from rendering, one test suite for the core, framework-agnostic by construction, SSR-safe as a consequence rather than a feature.
4. **Regulated-domain correctness.** Accessibility, validation, and patient-safety reasoning about hidden answers — the behaviour a clinical team needs from a form that holds up in production, not just one that matches the spec.

---

## 7. Success metrics

**Primary (decides success):**
- Teams running the kit in production or pilot clinical software, as seen through GitHub dependents, issues and discussions
- Integrations that clear an adopter's dependency, security and accessibility review using the published adoption pack, without contacting the maintainer
- Correctness in the field: few or no bug reports against features the conformance matrix marks `supported`

**Secondary (leading indicators, not goals in themselves):**
- Time-to-comprehension on the playground — an evaluator understands the project without reading code
- Time from install to a first rendered form (NFR-U-01)
- Repo attention: stars, forks, inbound questions
- npm installs

**Explicitly not a metric.** Issue throughput, community size.

---

## 8. Constraints

- **Time.** Main build assumed at roughly three to four weeks at a sustainable part-time pace, followed by cosmetic polish and slow maintenance. Confirm before milestone planning — this is the number the whole plan hangs on.
- **Nothing ships partial.** There is no second phase for adopters to wait for, so every shipped layer must be complete at its chosen depth.
- **Every decision defensible unaided.** The maintainer must own the reasoning behind every decision and be able to argue it without outside help.
---

## 9. Open questions for business analysis

1. **The demo questionnaire.** Which single form exercises cascading `enableWhen`, a repeating group, and scoring at once? PHQ-9 is nine flat radio questions and exercises none of the structural rules on its own. This form is simultaneously the README GIF, the playground default, and the core test fixture. Design it or source it.
2. **Licence.** Apache 2.0 recommended over MIT — the explicit patent grant is what enterprise and regulated legal teams look for, which aligns with the primary user. Confirm.
3. **Naming.** `fhir-questionnaire-kit` for the repo and `@fhirq/*` for packages is settled. Whether to add a brand (Flint, Hearth) is a marketing decision that can be deferred past launch.
4. **Accessibility target.** WCAG 2.2 AA assumed. Decide how it is verified in CI and what evidence appears in the README — this is a claim the primary user will check.
5. **Reference backend.** Docker Compose with synthetic patients, for local development only — or drop it. It is the most cuttable item in the plan.
6. **Scoring extension point.** Shape of the API, and whether a PHQ-9/GAD-7 scoring example ships as documentation or as a package.
