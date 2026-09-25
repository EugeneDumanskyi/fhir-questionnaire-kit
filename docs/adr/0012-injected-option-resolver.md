# ADR-0012 — Option lists come from an injected resolver; only the element ships a default

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** Brief §3, §6 principle 2 · US-07.1 (AC-07.1.1–4), AC-01.1.2, AC-09.1.1, AC-14.6.1 · NFR-X-01, NFR-X-02, NFR-S-02, NFR-C-04 · INV-S-34, INV-X-01–03, SM-04, BC5 · ADR-0005 · NFR-M-05 topic *resolver injection*

## Context

A `choice` or `open-choice` item may list its options by reference to a `ValueSet` canonical URL instead of inline. Getting the options means contacting something: a FHIR terminology server, the host's own API, a static file, or a cache.

The primary user owns authentication, tenancy, data residency, retries, caching and offline behaviour, and "a library that does its own HTTP … is disqualified before evaluation" (Brief §3). The secondary user drops a script tag into a server-rendered page and has no JavaScript to write a resolver in (Brief §3, AC-09.1.1).

ADR-0005 decides *when* options are resolved and that they stay out of snapshots, and it assumes a resolver port exists. This ADR argues for the port itself and settles where the only network code in the kit lives.

## Options considered

**A. The core fetches, configured by a base URL plus options** (headers, credentials, timeout, retry count). Rejected. Every host policy becomes a configuration option the kit must anticipate, including token refresh, mutual TLS, request signing and offline queues, and it will never cover all of them. The core would need network access, which breaks the testable no-network claim (NFR-X-01, AC-14.6.1) and the property the buyer screens for.

**B. The core accepts an injected `fetch`-compatible function.** Better, since the host controls transport. Rejected. The kit would still decide the request: the URL shape (`$expand` or not), the parameters, response parsing, error mapping. A host whose options come from a non-FHIR API or from IndexedDB would have to fake a FHIR server behind a fake `fetch`. The port would be shaped like HTTP when the domain needs something shaped like terminology.

**C. The host supplies every option list synchronously at session creation.** Rejected as the only mechanism, for the reasons in ADR-0005 option C: every host must walk the questionnaire first, and per-item pending, failed and retry states disappear. A host that wants it can still do it through D, by answering from a pre-filled map.

**D. A domain-shaped asynchronous port: canonical URL → coded options.** Chosen.

## Decision

**The port** (types in `ports/`, exported from `@fhirq/core`):

```ts
type OptionResolver = (
  valueSet: string,               // canonical URL, possibly with |version
  context: { signal: AbortSignal } // aborted when the session is disposed
) => Promise<readonly CodedOption[]>;

interface CodedOption { system?: string; code: string; display?: string }
```

- Called once per distinct canonical per session, at session start (ADR-0005), and again only on an explicit `retryOptions(valueSet)` after failure.

  *Amended 2026-09-19 (`06-roadmap.md` M4 plan decision D6).* The retry is a command, `dispatch({ type: 'RetryOptions', valueSet })`, not a session method. It goes through the single writer like every other change, and outside `Failed` it is refused as `options-not-failed`, a no-op cycle with a reason, as `04-domain.md` §7.1 already has it. As built, the resolver returns a `PromiseLike` of inline option shapes, so `CodedOption` is not a separate export (M4 plan D1), and the host's rejection reaches it through `SessionOptions.onCollaboratorError`. Core types `AbortSignal` structurally in `ports/`. Core creates the `AbortController` in `session/options.ts`, the one file the `no-dom-in-core` lint allowlist permits to do so; nothing in core performs I/O with it.
- Rejection is surfaced verbatim to the host in memory. Diagnostics carry the canonical and a `resolver-failed` code, never the error's message (NFR-X-04).
- `session.dispose()` aborts the signal. Late settlements after disposal are ignored (SM-04).
- A settlement enters the session as its own evaluation cycle (ADR-0009, T12).

**The default resolver lives in `@fhirq/element` only.** It is used when the element has a `value-set-base` attribute and no `resolver` property:
- one `GET {value-set-base}/ValueSet/$expand?url={canonical}` with `Accept: application/fhir+json`, `credentials: "same-origin"` and the abort signal;
- it parses `expansion.contains` (flattening nested `contains`) into `CodedOption[]`;
- non-2xx responses, network errors and parse failures all reject with a typed error. No retries, no caching beyond ADR-0005's once per session, no logging;
- when the attribute is absent, the element has no resolver and items report `unresolved-options` (AC-01.1.2).

The element's `resolver` property replaces the default entirely. The React adapter ships **no** default: programmatic users must pass a function, even a one-line `fetch` wrapper, so the network call is visible in their own code.

## Consequences

**Benefits**
- **Every host policy works unchanged,** because the host's resolver contains it: auth, tenancy headers, caching, offline, non-FHIR sources, and pre-population for SSR from a cache.
- **`@fhirq/core`, `@fhirq/react` and `@fhirq/themes` contain no network API at all.** That is checkable by lint and by the throwing-stub test, not a promise.
- **The one network path in the kit is a single, documented function in one package.** A security reviewer can read all of it in one sitting.
- The port speaks terminology, not HTTP, so tests use plain in-memory resolvers.

**Costs accepted**
- **The default resolver is deliberately naive.** It sends no auth header. A same-origin cookie session works; anything else needs the `resolver` property, which means writing JavaScript. For EMB with a protected terminology server, "no build step" (AC-09.1.1) does not extend to authenticated resolution. The docs say so.
- **`$expand` against the base is an assumption about the server.** A server that does not support `$expand`, or needs `filter`/`count` parameters for large value sets, needs a custom resolver. Paging large expansions is not handled.
- **Integrators write a resolver even for simple cases.** The quickstart shows a five-line `fetch` resolver, which counts against NFR-U-01 only for questionnaires that reference value sets. The demo fixture uses inline options.
- **The asymmetry needs explaining:** a default in the element, none in React. The explanation is short: declarative embeds have nowhere to put a function, and programmatic users do.

**Verification**
- Lint rule (NFR-M-06 "no network API"): `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` are banned in every package, with a single file-level exception for `packages/element/src/default-resolver.ts`.
- AC-14.6.1 throwing-stub test: the full lifecycle of core, react and themes invokes no stub. The element test with the default resolver shows network calls only from the default resolver, one per distinct canonical.
- A resolver contract test suite runs against the default resolver with a mocked server: success, nested `contains`, non-2xx, malformed JSON and abort on dispose. Each outcome maps to the documented option-set state.

**Amendment note, accepted 2026-09-25 (`06-roadmap.md` M7 plan D1): the `src` loader shares the file.** AC-09.1.1 has the embedder write `<fhir-questionnaire src="…">`, so the element must fetch the questionnaire, and this ADR, CLAUDE.md and `05-architecture.md` §5 and §6.1 allowed only the value-set request. The questionnaire request lives in the same file, `packages/element/src/default-resolver.ts`, which holds the value-set resolver and the `src` loader and nothing else. The lint's single file-level exception is unchanged. Where the Consequences say "a single, documented function", read "a single, documented file": a reviewer still reads the kit's whole network path in one sitting.
- **The `src` request:** one `GET` of the attribute's URL, resolved against the document's base URL, with `Accept: application/fhir+json`, `credentials: "same-origin"` and the connection's abort signal. It is made when the element needs a session for that `src`: on first connect, and again only when `src` changes to a new value (M7 plan D6).
- **Failure:** non-2xx responses, network errors and parse failures reject with a typed error, which the element delivers verbatim as `fhirq-error` and leaves the form empty. No retries, no caching, no logging, as for value sets.

The Verification's throwing-stub test counts both: network calls come only from this file, one per distinct canonical and one per `src` value. `05-architecture.md` §5 and §6.1 name both requests on the one arrow.
