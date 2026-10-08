import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { declared, ENTRY_POINTS, LIMIT, reexports, symbols } from '../check-api.mjs';

/**
 * NFR-U-05: at most 60 public symbols across all packages. Each entry point is
 * counted from its API Extractor report, by `scripts/check-api.mjs`, which
 * `pnpm lint` runs and the README's published numbers read.
 */

const root = new URL('../../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');

describe('the public API surface (NFR-U-05)', () => {
  it('has a report for every entry point', () => {
    for (const entry of ENTRY_POINTS) expect(existsSync(new URL(entry.report, root)), entry.name).toBe(true);
  });

  it('reads a re-export from a report without counting it', () => {
    const report = "import { createSession } from '@fhirq/core';\nimport type { Session } from '@fhirq/core';\n\n// @public\nexport function useThing(session: Session): void;\n\nexport { createSession }\n";
    expect(reexports(report)).toEqual([{ name: 'createSession', from: '@fhirq/core' }]);
    expect(declared(report)).toEqual(['useThing']);
  });

  it('counts a re-export only where it is declared (M6 plan D5)', () => {
    const listed = Object.fromEntries(ENTRY_POINTS.map((entry) => [entry.name, reexports(text(entry.report))]));
    for (const [name, names] of Object.entries(listed)) for (const reexport of names) expect(reexport.from, `${name} re-exports ${reexport.name}`).not.toBeNull();
    expect(listed['@fhirq/react']).toEqual([{ name: 'createSession', from: '@fhirq/core' }]);
  });

  it('counts each entry point', () => {
    expect(Object.fromEntries(Object.entries(symbols()).map(([name, names]) => [name, names.length]))).toEqual({
      '@fhirq/core': 35,
      '@fhirq/core/view': 15,
      '@fhirq/core/resume': 3,
      '@fhirq/react': 3,
      '@fhirq/element': 2,
      '@fhirq/themes': 1,
    });
  });

  it(`exports at most ${LIMIT} symbols across all packages`, () => {
    expect(LIMIT).toBe(60);
    expect(Object.values(symbols()).flat().length).toBeLessThanOrEqual(LIMIT);
  });
});
