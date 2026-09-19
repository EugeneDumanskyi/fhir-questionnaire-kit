import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * NFR-U-05: at most 60 public symbols across all packages. An entry point with
 * an API Extractor report is counted from the report; one without a report yet
 * (React from M6, the element from M7, themes from M8) from its source entry.
 */

const root = new URL('../../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');

const ENTRY_POINTS = [
  { name: '@fhirq/core', report: 'packages/core/etc/core.api.md' },
  { name: '@fhirq/core/view', report: 'packages/core/etc/core-view.api.md' },
  { name: '@fhirq/core/resume', report: 'packages/core/etc/core-resume.api.md' },
  { name: '@fhirq/react', source: 'packages/react/src/index.ts' },
  { name: '@fhirq/element', source: 'packages/element/src/index.ts' },
  { name: '@fhirq/themes', source: 'packages/themes/src/index.ts' },
];

const fromReport = (report) => [...report.matchAll(/^export (?:declare )?(?:abstract )?(?:type|interface|function|class|const|enum|namespace) (\w+)/gm)].map((match) => match[1]);

const fromSource = (source) =>
  [...source.matchAll(/^export (?:type )?\{([^}]*)\}|^export (?:const|function|class|interface|type) (\w+)/gm)].flatMap((match) =>
    match[2] !== undefined ? [match[2]] : match[1].split(',').map((name) => name.replace(/\btype\b/, '').trim()).filter(Boolean),
  );

const symbols = (entry) => (entry.report !== undefined ? fromReport(text(entry.report)) : fromSource(text(entry.source)));

describe('the public API surface (NFR-U-05)', () => {
  it('has a report for every entry point that is past its spike', () => {
    for (const entry of ENTRY_POINTS.filter((candidate) => candidate.report !== undefined)) expect(existsSync(new URL(entry.report, root)), entry.name).toBe(true);
  });

  it('counts each entry point', () => {
    expect(Object.fromEntries(ENTRY_POINTS.map((entry) => [entry.name, symbols(entry).length]))).toEqual({
      '@fhirq/core': 35,
      '@fhirq/core/view': 15,
      '@fhirq/core/resume': 3,
      '@fhirq/react': 2,
      '@fhirq/element': 2,
      '@fhirq/themes': 1,
    });
  });

  it('exports at most 60 symbols across all packages', () => {
    expect(ENTRY_POINTS.flatMap(symbols).length).toBeLessThanOrEqual(60);
  });
});
