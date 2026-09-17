# S2 — Mutation and pipeline cost

*Spike for M2 (`06-roadmap.md` §3). Timebox 2 h. Question: what does incremental StrykerJS cost on this engine, and does the PR pipeline still fit 10 minutes? Output: this note, and A6 confirmed or ADR-0018's relief valve invoked. Kill criteria K1–K3 are M2 plan decision D11.*

**Run date:** 2026-09-17, straight after step 6 merged. **Code under mutation:** the enablement modules as they stand after step 6.

---

## 1. Method

- **Scope.** `stryker.config.json` mutates the modules that decide enablement: `definition/graph.ts` and `scc.ts`, `session/conditions.ts`, `enablement.ts`, `heap.ts`, `store.ts` (scope resolution), `guard.ts` and `session.ts` (the cycle). The plan named `graph`, `scc`, `conditions`, `enablement` and `cycle`. The cycle is `session.ts` plus `guard.ts`, and scope resolution lives in `store.ts`, so those were added. The result is 1,001 mutants.
- **Runner.** StrykerJS 10 runs through the Vitest runner against the core suite only (`stryker.vitest.config.ts`), with per-test coverage.
- **CI.** A non-blocking job, `Mutation, incremental`, carries the incremental file in the Actions cache. The key is per branch, with `main` as the fallback.
- **Measured twice on the CI runner.** A cold run with no incremental file. Then an incremental run after a one-file change that added a test, which is what most PRs look like. Local runs on a 12-core laptop are given for comparison only.

## 2. Measurements

| Run | Where | Mutants re-run | Mutation step | Whole job |
|---|---|---:|---:|---:|
| Cold, no incremental file | CI, `ubuntu-latest` (4 cores by `nproc`) | 1,001 | **3 min 38 s** | 3 min 56 s |
| Incremental after adding one test | CI, same runner | 559 | **2 min 13 s** | 2 min 36 s |
| Cold | local, 12 cores | 1,001 | 2 min 54 s | — |
| Incremental after a one-line source change, tests untouched | local | 1 | 6 s | — |
| Incremental after adding one test | local | 565 | 2 min 25 s | — |
| Cold, `--ignoreStatic` | local | 814 scored | 2 min 14 s | — |
| Incremental after adding one test, `--ignoreStatic` | local | — | 1 min 29 s | — |

The other lanes in the same CI run: the fast lane took **26–31 s**; the browser proofs (Chromium and WebKit, non-blocking) took **1 min 24 s–1 min 31 s**. Runs 35193501510 and 35194000387.

**Mutation score:** **85.4 %** on the runner (838 killed, 17 timed out, 127 survived, 19 not covered). That is above NFR-Q-03's 80 %. Locally the same code scored 91.5 %. The difference is 62 mutants that timed out under a 12-worker load, where a timeout counts as detected, and that survive on the runner. **The runner's figure is the one to trust.**

## 3. What drives the cost

1. **A changed test file invalidates every mutant its tests cover.** `session.test.ts` covers nearly all of the cycle, so adding one test re-runs 56 % of mutants. Source-only changes are almost free: one changed function re-runs one mutant. Most PRs change tests, so **the incremental PR cost is about 60 % of a cold run, not a few seconds.**
2. **Static mutants are expensive but not dominant.** These are the mutants in module-level tables: the comparison table, the operator table, the per-kind comparators. Stryker estimated 65 % of mutants were static and would take 99 % of the time. Measured, ignoring them saves about 25 % cold and about 40 % incrementally. The price is the score falling to 85.1 % locally, because those mutants are killed by the operator × type tests. **Not recommended:** it removes the mutants that guard D2 and D3.
3. **The runner is not the assumed 2 cores.** `nproc` reports 4 on `ubuntu-latest` for this public repository. NFR-M-07's reference is "a 2-core standard GitHub-hosted runner" (`03-nfr.md` N1). The figures above are from 4 cores; on 2 cores the mutation step would take roughly twice as long.

## 4. Kill criteria

| # | Criterion | Reading | Verdict |
|---|---|---|---|
| K1 | Incremental PR mutation run over 4 min on the runner | 2 min 13 s; even a cold run is 3 min 38 s | **Not triggered** |
| K2 | Projected blocking PR pipeline over 10 min p95 after K1 | Lanes run in parallel, so wall-clock is the slowest lane plus queueing: about 2.5–4 min with mutation, coverage, the budget check and benchmarks all blocking (step 12) | **Not triggered** |
| K3 | Stryker cannot run on Vitest 3.2.7 and this TS setup within the timebox | Runs, with one configuration fix: the Vitest runner plugin must be named, because pnpm's isolated `node_modules` hides it from auto-discovery | **Not triggered** |

**A6 is confirmed for M2:** incremental mutation on PRs, a full run nightly. **ADR-0018's relief valve is not invoked;** WebKit stays in the PR lane.

## 5. What to watch

- **Growth.** NFR-Q-03's scope also covers validation (M3) and emission (M3). If the mutant count doubles and a test change re-runs 60 % of mutants, the incremental run on 4 cores lands at about 4.5 min. **K1 is likely to trigger in M3, not M2.** Re-measure when M3 adds `validation/` to the mutate list.
- **Relief before any cut.** If K1 triggers, split the mutation lane into a matrix of jobs by module. The scope stays whole and wall-clock divides across runners. That is a pipeline change, not the cut ladder's first rung, which narrows what is mutated and is the maintainer's call (D11 K2).
- **The 2-core assumption.** N1 describes a runner this repository does not get. Either record 4 cores as the observed reference, or keep 2 cores as the conservative one and treat these figures as optimistic by 2×. Raised in step 14's close-out, not decided here.
- **Timeouts.** Stryker's default timeout lets a loaded machine count survivors as timeouts. The nightly run should use the runner, not a developer machine, as the score of record.

## 6. Not covered

- **No nightly workflow yet** (step 12), so the full-run figure is the cold PR figure above.
- **No p95.** Two CI runs are two samples, not a distribution; NFR-M-07's p95 comes from Actions run data over time (ADR-0018).
- **One PR shape.** The incremental figure is for a PR that touches one test file. A PR that touches `session.test.ts` and the conditions table together would re-run close to all mutants.

## 7. Addendum, 2026-09-17: K1 triggered at step 12, and relieved

M2's later steps added three suites that S2 never timed: the generated properties (step 9), the recompute-set check at the scale ceiling (step 10), and the conformance runner (step 11). On PR #27, which touched most test files, the incremental run re-ran 498 of 1,086 mutants in **5 min 1 s**, and the job took 5 min 26 s. **K1 triggered.**

| Run on the CI runner | Mutants re-run | Mutation step | Score |
|---|---:|---:|---:|
| PR #26, before the relief | 209 | 3 min 16 s | 90.06 % |
| PR #27, first push | 498 | **5 min 1 s** | 90.06 % |
| PR #27, after the relief | 175 | 2 min 28 s | 90.06 % |
| PR #28, after the relief, the same 498 mutants as PR #27's first push | 498 | **2 min 20 s** | 89.96 % |

- **Cause.** 84 % of mutants are static, and each one reruns the whole core suite. The ceiling test is half that suite's time (1.9 s of about 3.5 s).
- **Why not K1's listed relief.** Moving WebKit to nightly shortens the pipeline, not the mutation lane, and WebKit runs in the non-blocking lane.
- **The relief taken.** `stryker.vitest.config.ts` excludes `test/property/ceiling.test.ts`; `pnpm test` still runs it. Full local runs with and without it detect the same mutants (983 and 986; scores 90.5 % and 90.8 %) in 9 min 28 s and 6 min 10 s. The generated properties already assert the same BFS equality, on small trees. On the runner, 498 re-run mutants took 5 min 1 s with the ceiling test and 2 min 20 s without it.
- **K2 is not near.** The blocking pipeline runs in about 3 min wall-clock, because its lanes run in parallel.

**Watch in M3.** §5's growth estimate stands, and the static-mutant share makes it steeper. Every test file M3 adds is paid for once per static mutant. The next reliefs, in order: keep slow tests out of the mutation suite as here; split the lane into a matrix of jobs by module; `ignoreStatic` only as the maintainer's call, since it drops the D2 and D3 table mutants.
