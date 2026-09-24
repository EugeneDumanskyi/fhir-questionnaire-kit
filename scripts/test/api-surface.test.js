import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * NFR-U-05: at most 60 public symbols across all packages. An entry point with
 * an API Extractor report is counted from the report; one without a report yet
 * (the element from M7, themes from M8) from its source entry.
 *
 * A re-export of another `@fhirq/*` package's declaration, such as
 * `@fhirq/react`'s `createSession` (ADR-0015), is one symbol under two names,
 * so it is listed but not counted again (M6 plan D5). A report shows it as
 * `export { name }` with `name` imported from that package.
 */

const root = new URL('../../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');

const ENTRY_POINTS = [
  { name: '@fhirq/core', report: 'packages/core/etc/core.api.md' },
  { name: '@fhirq/core/view', report: 'packages/core/etc/core-view.api.md' },
  { name: '@fhirq/core/resume', report: 'packages/core/etc/core-resume.api.md' },
  { name: '@fhirq/react', report: 'packages/react/etc/react.api.md' },
  { name: '@fhirq/element', source: 'packages/element/src/index.ts' },
  { name: '@fhirq/themes', source: 'packages/themes/src/index.ts' },
];

const fromReport = (report) => [...report.matchAll(/^export (?:declare )?(?:abstract )?(?:type|interface|function|class|const|enum|namespace) (\w+)/gm)].map((match) => match[1]);

/** `export { name }` lines, each with the `@fhirq/*` specifier its import names, or null when none does. */
const reexports = (report) => {
  const imported = new Map(
    [...report.matchAll(/^import (?:type )?\{([^}]*)\} from '(@fhirq\/[^']+)';$/gm)].flatMap((match) => match[1].split(',').map((name) => [name.replace(/\btype\b/, '').trim(), match[2]])),
  );
  return [...report.matchAll(/^export \{([^}]*)\}/gm)].flatMap((match) => match[1].split(',').map((name) => name.trim()).filter(Boolean)).map((name) => ({ name, from: imported.get(name) ?? null }));
};

const fromSource = (source) =>
  [...source.matchAll(/^export (?:type )?\{([^}]*)\}|^export (?:const|function|class|interface|type) (\w+)/gm)].flatMap((match) =>
    match[2] !== undefined ? [match[2]] : match[1].split(',').map((name) => name.replace(/\btype\b/, '').trim()).filter(Boolean),
  );

const symbols = (entry) => (entry.report !== undefined ? fromReport(text(entry.report)) : fromSource(text(entry.source)));

describe('the public API surface (NFR-U-05)', () => {
  it('has a report for every entry point that is past its spike', () => {
    for (const entry of ENTRY_POINTS.filter((candidate) => candidate.report !== undefined)) expect(existsSync(new URL(entry.report, root)), entry.name).toBe(true);
  });

  it('reads a re-export from a report without counting it', () => {
    const report = "import { createSession } from '@fhirq/core';\nimport type { Session } from '@fhirq/core';\n\n// @alpha\nexport function useThing(session: Session): void;\n\nexport { createSession }\n";
    expect(reexports(report)).toEqual([{ name: 'createSession', from: '@fhirq/core' }]);
    expect(fromReport(report)).toEqual(['useThing']);
  });

  it('counts a re-export only where it is declared (M6 plan D5)', () => {
    const listed = Object.fromEntries(ENTRY_POINTS.filter((entry) => entry.report !== undefined).map((entry) => [entry.name, reexports(text(entry.report))]));
    for (const [name, names] of Object.entries(listed)) for (const reexport of names) expect(reexport.from, `${name} re-exports ${reexport.name}`).not.toBeNull();
    expect(listed['@fhirq/react']).toEqual([]);
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
