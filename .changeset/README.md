# Changesets

Fixed mode: `@fhirq/core`, `@fhirq/react`, `@fhirq/element` and `@fhirq/themes`
share one version and release together, and depend on each other at exact
versions (ADR-0008, `05-architecture.md` §8 A3). Bumping one bumps all four,
which is what makes "install any two and they agree" true rather than hoped for.

`@fhirq/playground` is ignored: it is an app, never published.

Add a changeset in the same commit as any public API change (NFR-M-08):

```sh
pnpm changeset
```

There is no public API yet, so there are no changesets yet. The first one
arrives with M2, alongside `docs/07-api.md` and the API Extractor report.
