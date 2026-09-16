# ADR-0019 — Playground and docs are static, client-only and run under a strict CSP

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** Brief §2 (STK), §6 principle 1 · E12 (AC-12.1.1–2, AC-12.2.1, AC-12.3.1–2, AC-12.4.1, AC-12.5.1), US-13.2, US-13.3 · NFR-P-06, NFR-C-07, NFR-X-03, NFR-X-09, NFR-U-04, NFR-Z-01 · requirement R8, open question #5 (reference backend) · `05-architecture.md` §9 AT4

## Context

The playground carries the scanning stakeholder's whole evaluation (STK): 30 seconds, often on a phone, LCP ≤ 2.5 s and Lighthouse ≥ 90 on a throttled mid-tier device (NFR-P-06). It also carries a privacy claim an integrator's security team may test with the network panel open: pasted questionnaires and answers never leave the browser (AC-12.3.2). The docs site carries the technical evaluator's 15–40 minutes (EVL): guides, compiled examples (NFR-Q-08), ADRs and the conformance matrix.

Neither site handles data that needs a server. The open questions are hosting, the rendering model, and whether any analytics exist, which NFR-X-09 left undecided.

## Options considered

**A. A Next.js application on a managed host.** It would show the SSR claim (NFR-C-08) running live. Rejected. Every page view reaches a server the maintainer operates, which weakens the "nothing leaves the browser" statement to "nothing *we log* leaves the browser". It adds a hosting account and a deployment that can break while an evaluator is using it, and managed hosts default to analytics that must be switched off. SSR is already proved by the consumer smoke test in NFR-C-02, which is stronger evidence than a live page.

**B. Embedding a third-party sandbox** (StackBlitz, CodeSandbox). Rejected. Slow to first interaction on a phone (NFR-P-06), third-party scripts and cookies on the page, and the playground's default state is controlled by someone else's uptime.

**C. Static single-page playground and static docs, served from GitHub Pages, with a CSP that forbids outbound connections.** Chosen.

**Analytics**

- **D. Cookieless page-view counting** (the original NFR-X-09 recommendation, since replaced). Rejected. Any analytics script on a page that renders clinical forms is a claim surface. It also needs `connect-src` to allow an outside origin, which removes the strongest available proof below.
- **E. No analytics; use GitHub's repository traffic stats.** Chosen. The brief's secondary metrics (stars, forks, installs) are all available without it.

## Decision

- **Playground.** A Vite-built React SPA using `@fhirq/react` and `@fhirq/themes` **from their built `dist` output**, not from source, so it exercises the same artifact npm consumers get. Served under `/playground/` on GitHub Pages.
  - First paint shows the demo fixture form and one-sentence description (AC-12.1.1). The JSON editor, response/state pane and tier switcher load after first interaction or first idle period.
  - The editor is a plain `<textarea>` with parse diagnostics. A syntax-highlighting editor is `Could` and must lazy-load outside the Lighthouse measurement path.
  - Value sets in fixtures are served by an **in-memory resolver** over bundled data. There is no network resolver.
  - Share links encode questionnaire, tier and theme in the **URL fragment** only (R8), compressed with the platform `CompressionStream` API, so there is no dependency.
- **Docs.** A static site generated at build time. Code samples are imported from compiled, tested example files (NFR-Q-08, AC-13.2.1). ADRs and the conformance matrix are rendered from the repository's Markdown, so the site cannot drift from the source.
- **CSP on both sites,** delivered by `<meta http-equiv="Content-Security-Policy">` because GitHub Pages cannot set headers:
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'`.
  `connect-src 'none'` makes the browser itself refuse any `fetch`, XHR, WebSocket or beacon from the page. The playground says so in its visible privacy statement and links to the policy.
- **No analytics, no third-party scripts, fonts or images.** NFR-X-09 was amended to "none" on 2026-09-15 (`05-architecture.md` §9 AT4), and AC-12.3.2 now requires the `connect-src 'none'` policy.
- **No reference backend** (open question #5): the playground shows the product working without one.

## Consequences

**Benefits**
- **AC-12.3.2 is enforced by the browser, not by the kit's good behaviour.** An integrator's security team can read the CSP and see that no connection is possible, which is a stronger claim than an empty network panel.
- **The playground dogfoods NFR-C-07:** the real React renderer and themes run under the same strict policy the kit promises integrators.
- **Nothing to operate.** No server, account, secret or monthly bill; the sites survive into maintenance mode (NFR-M-09) with zero upkeep.
- **Fast on a phone:** static assets from a CDN edge, with only the form in the critical path.

**Costs accepted**
- **No live SSR example.** The SSR claim rests on CI evidence (NFR-C-08, NFR-C-02) linked from the docs, not on a page an evaluator can open.
- **No usage data** beyond GitHub's 14-day traffic view. The maintainer cannot tell which docs pages visitors read.
- **`<meta>` CSP is weaker than a header:** `frame-ancestors`, `report-uri` and `sandbox` are ignored in meta policies, so the playground cannot forbid being framed. Accepted, because the page holds no credentials and no session.
- **Share-link length is bounded by URL limits.** Very large pasted questionnaires will not fit in a fragment; the share button says so rather than truncating.
- **Paths from `dist` mean a package build before every playground build,** which adds time to CI's site lane.

**Verification**
- A Playwright test loads the playground with the network log recording, pastes a questionnaire containing a unique sentinel, answers items and switches every tier. It asserts no request after initial asset load and no `securitypolicyviolation` events.
- A test asserts the served HTML contains the CSP meta tag with `connect-src 'none'` as the first element in `<head>`.
- Lighthouse CI runs against the built playground at mobile settings and fails below the NFR-P-06 thresholds.
- A link checker runs over the built docs, including every conformance-matrix test link (AC-13.4.2).
