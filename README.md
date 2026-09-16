# FHIR Questionnaire Kit

Render a FHIR **R4 (4.0.1)** `Questionnaire` as an accessible clinical form and
emit a valid `QuestionnaireResponse` — without hand-coding each instrument.

A DOM-free engine holds the spec behaviour (cascading `enableWhen`, nested and
repeating groups, validation, a scoring port, save/resume, answer retention). A
DOM-free presentation model holds the presentation behaviour. Thin renderers
bind it to React and to a vanilla custom element. No runtime dependencies; no
backend, transport or identity — those belong to the host.

> **Status: pre-release, and not yet usable.** The repository is at milestone
> **M0** of eleven: decisions, workspace and CI only. Every package entry point
> below is a placeholder that exports nothing you can build on, and the first
> engine code arrives in M1. See `docs/06-roadmap.md`.

## Packages

| Package | What it will be |
|---|---|
| `@fhirq/core` | The engine. `@fhirq/core/view` is the presentation model |
| `@fhirq/react` | Hooks and a default UI over the presentation model |
| `@fhirq/element` | `<fhir-questionnaire>`, shadow DOM, no framework |
| `@fhirq/themes` | `base.css` and token presets, `--fhirq-*` custom properties |

## Working on it

Node is pinned in `.nvmrc` and pnpm in `package.json`'s `packageManager`.
Node 25 and later no longer bundle Corepack, so install it once:

```sh
npm install --global corepack && corepack enable pnpm
pnpm install
pnpm typecheck   # tsc --build across the workspace
pnpm lint        # ESLint, including the four architectural rules
pnpm test        # Vitest, Node only
```

## Documentation

`docs/` carries the reasoning, and it is meant to be read rather than skimmed:
the brief, requirements and acceptance criteria, the NFRs and their gates, the
domain model and its invariants, the architecture, the roadmap, and twenty
architecture decision records in `docs/adr/`.

## Licence

Apache-2.0 — see `LICENSE` and `NOTICE`. HL7® and FHIR® are trademarks of
Health Level Seven International; this project is not affiliated with or
endorsed by HL7.
