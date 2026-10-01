# A README whose numbers have drifted

<!-- numbers:start -->
| Figure | Published | Source |
|---|---|---|
| `@fhirq/core` | ≤ 14 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/core/resume`, beyond core | ≤ 4 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/core/view` | ≤ 8.2 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/react`, beyond React and core | ≤ 6 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/element`, with core, view and the default theme | ≤ 31.7 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/element` as one `<script>` (IIFE) | ≤ 31.9 kB | NFR-S-03, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/themes/base.css` | ≤ 4 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| `@fhirq/themes` preset, each | ≤ 3 kB | NFR-S-02, [`budgets.json`](scripts/budgets.json) |
| Items in one questionnaire | 1,000 | NFR-P-04, [`ceiling.json`](fixtures/bench/ceiling.json) |
| `enableWhen` conditions | 500 | NFR-P-04, [`ceiling.json`](fixtures/bench/ceiling.json) |
| Instances of one repeating group | 50 | NFR-P-04, [`ceiling.test.ts`](packages/core/test/property/ceiling.test.ts) |
| Groups nested inside one another | 10 | NFR-P-05 |
| Conditions in one `enableWhen` chain | 10 | NFR-P-05, [`graph.ts`](packages/core/src/definition/graph.ts) |
| Time to first render | 50 ms | NFR-P-01 |
<!-- numbers:end -->
