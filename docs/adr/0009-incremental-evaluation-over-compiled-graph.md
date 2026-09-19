# ADR-0009 — Incremental evaluation over a dependency graph compiled at load

- **Status:** Accepted
- **Date:** 2026-09-15
- **Accepted:** 2026-09-16 (`06-roadmap.md` §6 decision 2)
- **Traces to:** US-02.2 (AC-02.2.1–4), AC-02.5.1, AC-03.2.3, AC-06.2.1, AC-07.1.1 · NFR-P-01, NFR-P-02, NFR-P-04, NFR-P-05, NFR-P-08, NFR-P-09, NFR-Q-03 · INV-D-05, INV-D-11, INV-D-13, INV-S-01–08, INV-S-33, SM-01 `Evaluating`, `04-domain.md` §9.2 T12, §9.3 properties 3–4

## Context

The engine is the product (E02). After each command, every derived fact must be settled before anyone observes the session: enablement, retention effects, calculated values, validation, rule outcomes and scores (INV-S-05). The requirements pin down how that must perform and behave:

- **Speed.** ≤ 5 ms p95 to re-evaluate after one change on a 200-item form with a cascade depth of 5 (NFR-P-02), and ≤ 50 ms to create a session (NFR-P-01).
  *Amended 2026-09-17 (`06-roadmap.md` M2 close-out).* Spike S0 re-anchored both figures on 2026-09-16: the 200-item form sat in the trough of a bimodal distribution, so NFR-P-01 and NFR-P-02 are now measured on a 25-item fixture, which carries the absolute budgets, and a 500-item fixture, whose figures were set by M2's first measurement (`03-nfr.md` §1). The decision does not depend on the anchor.
- **Scale.** 1,000 items, 500 conditions and 50 repeat instances (NFR-P-04), within 8 MB of heap (NFR-P-08).
- **Incrementality.** Only transitive dependents are recomputed, **asserted by a test** (NFR-P-09, INV-S-07).
- **Determinism.** The result is independent of declaration order (INV-S-06).
- **Notification.** Exactly one change notification per cycle that changes something visible (INV-S-33).
- **Asynchronous input.** A resolver settling is its own cycle (T12).

Two further facts constrain the choice. The dependency graph is **static**: `enableWhen` edges are known at load, and cycles must be rejected at load (INV-D-05). Conditions may not read calculated items (INV-D-14), so enablement never depends on anything the engine cannot see.

The observable contract matters as much as the algorithm. React reads the session through `useSyncExternalStore` (ADR-0015), which requires `getSnapshot()` to return the same reference until something changes. The element's keyed patcher and `React.memo` both need per-node object identity to skip unchanged items.

## Options considered

**A. Full re-evaluation on every command.** The simplest correct engine: rebuild every derived value from the stored state. Rejected. It fails NFR-P-09 by definition, because that NFR asserts the recompute set rather than the timing. It would probably also miss NFR-P-02 at the scale ceiling once validation and rules are included.

**B. Runtime-tracked reactive signals.** Each answer is a signal, each derived value a computed that records what it reads. Rejected:
- The dependency graph must be known statically for cycle detection at load, so auto-tracking would rediscover at runtime what the Definition already holds. That is two sources of truth for one graph.
- Signals are usually pulled lazily. INV-S-05 wants everything settled before notification, and the one-notification guarantee needs an explicit batch boundary. Both work against the grain of lazy pull.
- A computed per node per derived property, across 1,000 items and 50 repeat instances, puts NFR-P-08's 8 MB at risk.
- A glitch-free signals implementation is itself a sizeable piece of hand-written code (ADR-0008) that brings no domain value.

**C. Immutable state, a pure reducer and memoised selectors (Redux-shaped).** Attractive for testing and snapshots. Rejected as the evaluation strategy. A reducer says nothing about *which* derived values to recompute: incremental enablement still needs a graph walk inside the reducer, and memoised selectors keyed on state identity make the recompute-set assertion (NFR-P-09) indirect. Copying the path to every changed node allocates on every keystroke. The strength worth keeping, immutable published values, is kept in D at the boundary.

**D. Compile the graph at load; on each command, propagate changes in topological order through a mutable internal store; publish immutable per-node views.** Chosen.

## Decision

**At load (BC1).** The Definition compiler:
1. assigns each item definition a dense integer id and stores definitions in flat tables;
2. builds dependency edges (condition question → dependent) plus the tree edges (parent → child), each labelled with its scope: *same repeat instance* or *global* (INV-D-13);
3. runs Tarjan's strongly-connected-components algorithm. Any component with more than one member, or a self-loop, is a cycle, and the load error names every `linkId` in it (AC-02.5.1). Otherwise it produces a topological rank per item definition;
4. checks depth limits (INV-D-07). This is all synchronous and I/O-free (INV-D-11).

**At runtime (BC2).** Stored state lives in mutable structures private to the session: answers by path, repeat instances with ordinals and positions, surfacing state, lifecycle status. Paths are interned strings built from `linkId`s and ordinals.

**The evaluation cycle.** One command runs as follows:
1. **Guard.** Validate the command against the settled state (refusals from ADR-0002, ADR-0003, SM-04, SM-05). A refusal ends the cycle: no mutation, no notification, a reason returned.
2. **Apply.** Mutate stored state and seed the dirty set with the affected nodes.
3. **Settle enablement.** Pop dirty nodes in topological-rank order (a binary heap keyed by rank). For each, recompute the node's own condition against *effectively enabled* question nodes only (INV-S-04), and its effective enablement from its parent (INV-S-01). If either changed, push its dependents, resolved in scope: same instance, or every instance for a global edge. Retention effects (SM-02, SM-05 under `discard`) are applied as nodes flip. Each node is processed at most once per cycle because ranks strictly increase along edges.
4. **Calculated values.** Re-run the evaluator for bound items whose enablement changed, or whose declared inputs changed. A binding with no declared inputs re-runs on any change to the projection (ADR-0017).
5. **Validation.** Re-run built-in checks for nodes whose answers or enablement changed. Re-run host rules and scorers whose declared input `linkId`s intersect the changed paths (INV-V-03, INV-X-04).
6. **Publish.** Build new immutable view objects for changed nodes only; unchanged nodes keep their object identity. Bump the session version, and return a new top-level snapshot object only if something visible changed.
7. **Notify.** If the version changed, call subscribers once with `{ changedPaths, responseChanged }`.

The recompute set from step 3 is recorded in an internal trace that the NFR-P-09 test reads. That test entry point is not part of the public API.

**Single writer.** A command issued while a cycle is running is queued and runs as its own cycle after the current notification finishes. This covers commands from a subscriber and from a resolver promise settling, which enqueues an internal `OptionsSettled` command (T12). A command issued from inside a rule, scorer or evaluator is refused, because those ports are pure (AC-04.3.2). No observer can therefore see `Evaluating`.

**Store contract.** The session exposes `subscribe(listener) → unsubscribe` and `getSnapshot()`, which returns a reference that is stable until the version changes. This is the shape `useSyncExternalStore` requires, and it is framework-neutral. Events carry paths and flags, never values (`04-domain.md` §7.2).

**Calculated items reading other calculated items.** *Resolved 2026-09-16
(`06-roadmap.md` §6 decision 3).* The evaluator is opaque (ADR-0003), so nothing
can be inferred about what one calculated item reads. Step 4 therefore evaluates
calculated items in **document order**: each sees the values of calculated items
earlier in the same cycle, and a calculated item referring to a *later*
calculated item reads the previous cycle's value. The alternative — rejecting
such a questionnaire at load — was rejected: it costs a detection pass over
expressions the engine otherwise never inspects, and it refuses a questionnaire
that is well formed by the specification. The one-cycle lag is a documented
behaviour with a conformance-matrix row and a fixture, not a defect, and it
settles within one further cycle because any later change re-runs both.

**Rules and scorers declare their inputs.** Registration takes the `linkId`s a rule or scorer reads. That list controls *when* it re-runs; what it receives is still the full read-only visible projection. Reading something undeclared is a contract violation: the result goes stale until one of the declared inputs changes. This is documented, not detected.

  *Amended 2026-09-19 (`06-roadmap.md` M4 plan decision D4).* Scorers and the expression evaluator receive the full visible projection, deeply frozen, as written here. Cross-field rules keep the narrower shape M3 shipped (M3 plan decision D5): the frozen answers of their declared `inputs`, scoped per shared repeat instance as `enableWhen` is. That shape is also read-only and holds nothing hidden, so INV-X-04 holds for both. A rule cannot read what it did not declare, which removes the stale-result case above for rules. Moving rules onto the full projection would be a breaking change to a `@beta` shape, and nothing needs it yet.

## Consequences

**Benefits**
- **NFR-P-09 is structural,** not a lucky property of the benchmark: the recompute set is exactly what the heap popped, and the test asserts it against the graph.
- **Determinism falls out of the rank order.** Declaration order affects only integer ids, never the order of evaluation (INV-S-06).
- **Per-instance behaviour is not special-cased.** A same-instance edge resolves against the dirty node's own instance (INV-S-08, `04-domain.md` §9.3 property 3).
- **Framework adapters get correct batching for free:** one version bump per cycle, stable references between cycles.
- **Heap stays proportional to stored state** plus one view object per node. There is no per-property reactive graph.

**Costs accepted**
- **Mutable internals.** Correctness rests on the private store being touched only inside the cycle. It is enforced by module privacy (ES private fields) and covered by mutation testing, not by immutability.
  *Amended 2026-09-17 (ADR-0021).* The session keeps its store in a closure, and the recompute trace and, from M3, the snapshot and restore path reach it through module-internal `WeakMap` registries keyed by the public session. Privacy is therefore enforced by lint on which modules may import those registries (`05-architecture.md` §4.1), not by the language.
- **Rules and scorers must declare inputs.** This makes registration one argument longer (NFR-U-03), and an incomplete declaration causes stale results rather than an error.
- **Session creation walks the whole graph once.** That is O(items + edges), well inside NFR-P-01, but it is the one non-incremental path, and restore and hydrate take it too.
- **Hand-written graph algorithms** (Tarjan, heap, scope resolution) are ~200 lines of core code with high mutation-testing value and high cost if wrong.

**Verification**
- NFR-P-09 test: for generated graphs up to the NFR-P-04 ceiling, change one answer and assert that the traced recompute set equals the transitive-dependent closure computed independently by breadth-first search.
  *Amended 2026-09-17 (`06-roadmap.md` M2 plan decision D15).* As first written, this line contradicted step 3 of the Decision, which stops propagating at a node whose own condition and effective enablement did not change; the traced set is then a strict subset of the full closure whenever propagation stops early. Step 3 stands. The test asserts two things instead: the traced set is contained in the scoped transitive-dependent closure, which is what keeps re-evaluation sub-linear; and it equals the set an independent breadth-first search reaches when it expands only through nodes whose own condition or effective enablement differs between from-scratch evaluations of the state before and after the change.
- Property test (fast-check): random questionnaires and command sequences. Assert that incremental settled state equals a from-scratch evaluation of the same stored state (option A used as the test oracle), and that shuffling declaration order does not change the result.
- Re-entrancy tests: a subscriber that issues a command, and a resolver settling during a cycle, each produce two notifications in order, and no subscriber observes a partially settled view.
- Benchmarks for NFR-P-01, P-02, P-07 and P-08 against committed baselines, failing on a > 20% regression (`03-nfr.md` §1).
  *Amended 2026-09-17 (`06-roadmap.md` M2 plan decision D7, as revised).* NFR-P-07 is response emission and is benchmarked when M3 builds it; M2 benchmarks P-01, P-02 and P-08. Hosted runners measured unchanged code up to 2.2× apart between jobs, so timings are compared with the merge base benchmarked in the same job, not with committed figures; retained heap is compared with the committed baseline. Both fail on a > 20% regression.

**Follow-ups**
- None outstanding. The calculated-item ordering question that stood here was
  resolved on 2026-09-16 and is now part of the decision above.
