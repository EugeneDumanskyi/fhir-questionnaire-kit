import { readdirSync, readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lock, type Doors } from '../../core/test/safety/doors.js';

/**
 * AC-14.6.1, NFR-X-01, NFR-X-02 for `@fhirq/themes` (M6 plan step 8). A
 * stylesheet reaches out through `url(…)` (images, fonts) and `@import`, so
 * neither may appear in any of them; comments are stripped first, since
 * prose may name them. The entry point loads with every door locked. That the
 * sheets fetch nothing once applied is held in a browser by
 * `tests/browser/hydration.spec.ts`, which lists every request a page makes.
 */

const SOURCES = new URL('../src/', import.meta.url);
const sheets = readdirSync(SOURCES).filter((name) => name.endsWith('.css'));

let locked: Doors;

beforeAll(() => {
  locked = lock(globalThis, {}, {});
});

afterAll(() => {
  locked.unlock();
});

describe('no network, no storage, no telemetry (AC-14.6.1, NFR-X-01, NFR-X-02)', () => {
  it('finds the stylesheets it holds to this', () => {
    expect(sheets.sort()).toEqual(['base.css', 'default.css']);
  });

  it.each(sheets)('%s loads nothing: no url() and no @import', (name) => {
    const css = readFileSync(new URL(name, SOURCES), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    expect(css).not.toMatch(/url\s*\(|@import|image-set\s*\(/i);
  });

  it('loads the entry point touching no door', async () => {
    const { TOKENS } = await import('../src/index.js');

    expect(TOKENS.length).toBeGreaterThan(0);
    expect(locked.touched).toEqual([]);
  });
});
