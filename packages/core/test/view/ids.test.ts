import { describe, expect, it } from 'vitest';

import type { NodeIds } from '../../src/view/index.js';
import { nodeIds, pathId } from '../../src/view/ids.js';
import { flatten, instancesOf, options, setup } from './helpers.js';

describe('path-derived ids (AC-5, INV-P-02)', () => {
  it('escapes a path into one id token and never maps two paths to one id', () => {
    expect(pathId('a b')).toBe('a_20_b');
    expect(pathId('a_20_b')).toBe('a_5f_20_5f_b');
    expect(pathId('1.2-x')).toBe('1.2-x');
    const all = (ids: NodeIds): string[] => [ids.control, ids.label, ids.description, ids.error];
    const ids = ['a', 'a-control', 'summary', 'summary-heading', 'a[1]', 'a/b'].flatMap((path) => all(nodeIds('p', path)));
    expect(new Set([...ids, 'p-summary', 'p-summary-heading']).size).toBe(ids.length + 2);
  });

  it('gives every node four ids and every instance its own, all unique, and ties each surfaced issue to its control', () => {
    const { session, at, model } = setup([
      { linkId: 'intro', type: 'display', text: 'Intro' },
      { linkId: 'name', type: 'string', text: 'Name', required: true },
      { linkId: 'c', type: 'choice', text: 'C', required: true, answerOption: options(2) },
      { linkId: 'meds', type: 'group', text: 'Meds', repeats: true, item: [{ linkId: 'dose', type: 'integer', text: 'Dose', required: true }] },
      { linkId: 'when', type: 'date', text: 'When' },
    ]);
    at('meds', 'repeating-group').add();
    at('when', 'calendar-date').set('soon');
    session.dispatch({ type: 'RequestCompletion' });

    const nodes = flatten(model().nodes);
    const all = [...nodes, ...instancesOf(model().nodes)].flatMap(({ ids }) => [ids.control, ids.label, ids.description, ids.error]);
    expect(nodes.every((node) => ['control', 'label', 'description', 'error'].every((key) => key in node.ids))).toBe(true);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => /^fq-[A-Za-z0-9._-]+$/.test(id))).toBe(true);

    // INV-P-02: each node with a surfaced issue says so (`invalid`) and has an error id its control can point at.
    const invalid = nodes.filter((node) => node.invalid).map((node) => [node.path, node.ids.error, node.issues.length > 0]);
    expect(invalid).toEqual([
      ['name', 'fq-name-error', true],
      ['c', 'fq-c-error', true],
      ['meds[0]/dose', 'fq-meds_5b_0_5d__2f_dose-error', true],
      ['meds[1]/dose', 'fq-meds_5b_1_5d__2f_dose-error', true],
      ['when', 'fq-when-error', true],
    ]);
    // …and every summary link lands on one of those controls.
    expect(model().errorSummary?.entries.map((entry) => entry.focusId)).toEqual(nodes.filter((node) => node.invalid).map((node) => node.ids.control));
  });

  it('keeps help text empty in v1, since R4 carries it where the kit rejects items (M5 plan D5)', () => {
    const { model } = setup([{ linkId: 'a', type: 'string', text: 'A' }]);
    expect(flatten(model().nodes).map((node) => node.description)).toEqual([null]);
  });

  it('carries the host-sanitized rich label, never raw markup (INV-X-06)', () => {
    const xhtml = { url: 'http://hl7.org/fhir/StructureDefinition/rendering-xhtml', valueString: '<b>Bold</b>' };
    const plain = setup([{ linkId: 'a', type: 'string', text: 'Bold', _text: { extension: [xhtml] } }], {}, { loadMode: 'lenient' });
    expect(flatten(plain.model().nodes)[0]).toMatchObject({ label: 'Bold', richLabel: null });
    const rich = setup([{ linkId: 'a', type: 'string', text: 'Bold', _text: { extension: [xhtml] } }], {}, { sanitize: (markup) => markup.replace('b>', 'strong>').replace('/b>', '/strong>') });
    expect(flatten(rich.model().nodes)[0]).toMatchObject({ label: 'Bold', richLabel: '<strong>Bold</strong>' });
  });
});
