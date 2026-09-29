import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { load } from '../src/load.js';
import { MATRIX, rowsByCode, rowsFor } from '../src/rows.js';

/** The paste editor's two pure parts (M9 step 7, AC-4): loading pasted text, and the conformance rows beside each diagnostic. */

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const demo = read('fixtures/demo/questionnaire.json');
const matrix = read('docs/conformance/matrix.json');

const questionnaire = (item: readonly object[]) => JSON.stringify({ resourceType: 'Questionnaire', status: 'active', item });
const attachment = questionnaire([
  { linkId: 'name', text: 'Your name', type: 'string' },
  { linkId: 'photo', text: 'A photo', type: 'attachment' },
]);

describe('load', () => {
  it('loads the demo with its host code', () => {
    const loaded = load(demo, 'strict');
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') return;
    expect(loaded.hostCode).toBe(true);
    expect(loaded.session.getSnapshot().scores).toEqual({ wellbeing: null });
  });

  it('loads another questionnaire without the demo host code, whose rule names items it lacks', () => {
    const loaded = load(questionnaire([{ linkId: 'name', text: 'Your name', type: 'string' }]), 'strict');
    expect(loaded.kind === 'loaded' && loaded.hostCode).toBe(false);
  });

  it('says what the parser said about text that is not JSON', () => {
    const loaded = load('{"resourceType": ', 'strict');
    expect(loaded.kind).toBe('not-json');
    if (loaded.kind === 'not-json') expect(loaded.message).toMatch(/\S/);
  });

  it('rejects unsupported input in strict mode, with every finding (AC-01.3.1)', () => {
    expect(load(attachment, 'strict')).toMatchObject({
      kind: 'rejected',
      code: 'definition-rejected',
      findings: [{ code: 'unsupported-item-type', severity: 'error', path: 'photo', detail: 'attachment' }],
    });
  });

  it('loads it in lenient mode, with the same finding as a diagnostic', () => {
    const loaded = load(attachment, 'lenient');
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind !== 'loaded') return;
    expect(loaded.session.diagnostics).toMatchObject([{ code: 'unsupported-item-type', path: 'photo' }]);
  });

  it('rejects JSON that is not a questionnaire in both modes', () => {
    for (const mode of ['strict', 'lenient'] as const) {
      expect(load('[]', mode), mode).toMatchObject({ kind: 'rejected', findings: [{ code: 'not-a-questionnaire' }] });
    }
  });
});

describe('rowsByCode', () => {
  const rows = rowsByCode(matrix);

  it("gives each code its rows, each linked to its anchor on the docs site's matrix page (M9 plan D5)", () => {
    const found = rows.get('unsupported-item-type') ?? [];
    expect(found.map((row) => row.id)).toEqual(['item-type.attachment', 'item-type.reference', 'item-type.url', 'item-type.time']);
    expect(MATRIX).toBe('../conformance.html');
    for (const row of found) expect(row.href, row.id).toBe(`../conformance.html#${row.id}`);
  });

  it('has none for a code no row lists', () => {
    expect(rows.get('control-contract')).toBeUndefined();
    expect(rowsFor(rows, 'control-contract', null)).toEqual([]);
  });

  it('narrows a finding to the row its detail names, and keeps them all when it names none', () => {
    const ids = (detail: string | null) => rowsFor(rows, 'unsupported-item-type', detail).map((row) => row.id);
    expect(ids('attachment')).toEqual(['item-type.attachment']);
    expect(ids('display')).toHaveLength(4);
    expect(ids(null)).toHaveLength(4);
  });
});
