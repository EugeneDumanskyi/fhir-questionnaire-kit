## What this changes

<!-- One paragraph. What behaviour is different afterwards, not what files moved. -->

## Traceability

<!-- Required, and checked by CI (NFR-M-08). At least one of: a story (US-04.2),
     an acceptance criterion (AC-04.2.3), an epic (E04), an NFR (NFR-P-02), an
     invariant (INV-D-15), an ADR (ADR-0009) or a milestone (M2). -->

-

## Definition of done

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` pass locally
- [ ] Every new module has tests; a bug fix starts with a failing test
- [ ] A spec behaviour has a fixture pair in `fixtures/`, a conformance test and a matrix row
- [ ] Public API change: `docs/07-api.md`, the API report and a changeset, in this commit
- [ ] Docs or ADRs updated if behaviour changed
- [ ] No answer values in diagnostics, errors, events or logs (NFR-X-04)
- [ ] View-model fields added or renamed: none names an HTML element, an ARIA attribute or a CSS property, and `view-fields.test.ts` passes (ADR-0007 review rule)

## What this does not cover

<!-- Say it here rather than leaving a reviewer to find it. -->
