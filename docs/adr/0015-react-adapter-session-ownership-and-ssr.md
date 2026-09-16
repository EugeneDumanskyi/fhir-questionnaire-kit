# ADR-0015 — React adapter: sessions owned outside components, SSR by construction

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** E08 (AC-08.1.1–4, AC-08.2.1, AC-08.3.1–2), AC-12.4.1, AC-05.2.1, AC-04.2.4 · NFR-C-03, NFR-C-08, NFR-P-03, NFR-S-02, NFR-U-01, NFR-U-03 · INV-P-01, INV-S-33, ADR-0009, ADR-0010, ADR-0011 · `05-architecture.md` §9 AT2

## Context

The React adapter is a thin renderer over the presentation model (ADR-0007). Three questions are specific to React.

**Who owns the session?** A component that creates its session in `useState` loses it when it unmounts, and a tier switch that swaps components unmounts it. AC-12.4.1 requires answers to survive a tier switch; INV-P-01 requires presentation to hold no domain state.

**What does "controlled" mean?** AC-08.1.2 asks for a controlled mode where "a host that supplies a response value and a change handler" re-renders with a new value and the form reflects it. If that value is a `QuestionnaireResponse`, a naive implementation rehydrates on every render, and hydration by design cannot carry retained answers or error display state (ADR-0010, ADR-0011). Every keystroke would then silently wipe the respondent's mis-tap protection and reset which errors they have been shown. That would quietly break two accepted decisions.

**How is SSR safe?** The initial render must produce markup reflecting initial enablement on the server (AC-08.3.1), with no DOM access and zero hydration warnings (NFR-C-08, AC-08.3.2), in React 18 and 19 (NFR-C-03).

## Options considered

**Session ownership**

**A. The component always owns its session.** Rejected. Tier switching loses state, and hosts cannot share one session between a form and a separate score panel or progress bar.

**B. The host always owns the session.** Rejected as the only mode. It adds a line and a concept to the quickstart (NFR-U-01), even for hosts that never need it.

**C. Both: the component creates a session when given a questionnaire, and accepts a host-created session instead.** Chosen.

**Controlled mode**

**D. The controlled value is a `QuestionnaireResponse`; rehydrate whenever it changes by reference.** Rejected. Hosts that clone state (a JSON round-trip through a store, `structuredClone`, a server action) produce a new reference on every change. Each keystroke would rehydrate, losing retained answers and surfacing.

**E. The controlled value is the snapshot.** Faithful, but rejected as the primary controlled prop. Snapshots are engine-internal JSON that hosts are told not to treat as a record (ADR-0010), and restoring a snapshot on every render costs a full graph walk (ADR-0009).

**F. The controlled value is the session object** (high fidelity), **plus a response-valued `value` with echo suppression** (compatibility). Chosen.

**SSR**

**G. Client-only rendering with a placeholder on the server.** Rejected. It fails AC-08.3.1, and a clinical form that renders nothing without JavaScript is worse for resilience.

**H. Synchronous session creation during render, deterministic ids, no effects needed for first paint.** Chosen.

## Decision

**Public surface** (within NFR-U-05):
- `useQuestionnaire(questionnaire | session, options?)` returns `{ session, view }`. With a questionnaire it creates and memoises a session for the component's lifetime; with a session it uses that session.
- `createSession(...)` is re-exported from core for hosts that own sessions.
- `<Questionnaire questionnaire={q} />` or `<Questionnaire session={s} />`, with `controls` (tier 3), `onChange`, `onComplete`, and `value` (see below).

**Reading state.** The hook reads through `useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)`, using the same function for the server snapshot. React can therefore never observe a partially settled session, and concurrent rendering cannot tear (ADR-0009). Per-item components are `React.memo` keyed by item path, and re-render only when their view object's identity changes, which keeps a keystroke cheap (NFR-P-03).

**Controlled by session.** Hosts that need full fidelity pass `session`. The host owns it and may keep it in a ref or store, and every tier renders it.

**Controlled by response (AC-08.1.2–4).** When `value` is given:
1. If `value` is the reference last emitted by this session, do nothing.
2. Otherwise, if `value` is semantically equal to the last emitted response (the same comparison as INV-E-06: content and host identity, ignoring `authored` and `status`), do nothing.
3. Otherwise treat it as an **external replacement**: hydrate a new session from it, and raise a `controlled-value-replaced` diagnostic.

The documentation states plainly that step 3 resets retained answers and error display state, and recommends `session` for any host that edits responses outside the form.

**SSR by construction.**
- No DOM or `window` access at module scope or during render. The NFR-M-06 "no DOM in core" rule applies to core; in the React package, DOM access is allowed only inside effects and event handlers, enforced by a lint rule that bans DOM globals in component and hook bodies.
- `createSession` is synchronous (AC-01.1.1), so the server render has fully settled enablement.
- **Ids** are `${useId()}-${pathId}`. `useId` gives a prefix that matches between server and client in React 18 and 19; the path part comes from the item path, which is stable across renders (ADR-0007).
- Option resolution starts in an effect on the client, never during server render. Value-set-bound items render their pending state on both server and first client render, so the markup matches; resolution then arrives as a normal cycle.
- `authored` is not rendered, and no clock or random value is read during render.
- Focus movement and live-region announcements happen in effects only.

## Consequences

**Benefits**
- **Tier switching, a separate score panel and the playground's state pane share one session** with no special machinery (AC-12.4.1).
- **The common controlled pattern works as developers expect:** store the response from `onChange` and pass it back. It does so without losing retention, because a clone of the response the form just emitted is recognised as an echo.
- **SSR needs no client-only escape hatch,** and hydration matches because nothing in first render depends on the client.
- The same `subscribe`/`getSnapshot` contract serves any other framework a host wraps.

**Costs accepted**
- **Semantic equality has a cost when references differ.** It runs only when a host passes a new reference whose content matches, and it is bounded by the emission budget (NFR-P-07, ≤ 20 ms at 1,000 items). Hosts that clone on every keystroke pay it on every keystroke.
- **Two controlled modes to document.** "Use `session` if you edit responses outside the form" is one more rule for integrators to learn.
- **Value sets are never resolved on the server,** so server-rendered value-set items always show a pending state first. Hosts wanting resolved options in server markup must use inline options or pre-resolve and pass a cached resolver; even then the first client render stays pending to match.
- **Host-owned sessions must be disposed by the host.** A component-owned session is disposed on unmount; a passed-in one is not.

**Verification**
- AC-08.3.1 and AC-08.3.2: render the demo fixture with `react-dom/server` in Node with no DOM shim, hydrate it in a browser, and fail on any console warning, in both React 18 and 19.
- Echo-suppression test: controlled by `value`, the host stores `structuredClone(response)` from `onChange`. After hiding an answered item and re-showing it, the retained answer is present and no `controlled-value-replaced` diagnostic was raised.
- External-replacement test: passing a response with different content raises the diagnostic, and the form reflects the new content.
- Tier-switch test: the same session rendered by `<Questionnaire>`, then a tier-3 variant, then a headless view keeps its answers and surfacing unchanged.
- Render-count test: typing into one text item re-renders only that item's component.

## Follow-ups

**Accepted on 2026-09-15 as AC-08.1.2–4** (`05-architecture.md` §9 AT2). Session-controlled mode, echo suppression and the `controlled-value-replaced` diagnostic are now requirements.
