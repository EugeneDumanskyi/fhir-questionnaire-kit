---
'@fhirq/core': patch
'@fhirq/react': patch
'@fhirq/element': patch
'@fhirq/themes': patch
---

A CommonJS consumer now gets CommonJS types: each `require` entry names a `.d.cts` beside its `.cjs` file. Before, TypeScript under `node16` resolution refused to `require` the packages. Every package now declares `engines` `>=22`, the oldest Node line still supported and the oldest one tested.
