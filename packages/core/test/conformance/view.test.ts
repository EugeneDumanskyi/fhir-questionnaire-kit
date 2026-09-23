import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createSession, type LoadMode, type Questionnaire } from '../../src/index.js';
import { createView } from '../../src/view/index.js';
import { find, flatten } from '../view/helpers.js';

/**
 * The view's side of the conformance fixtures (M5 step 13): a case that names
 * `controls` is loaded through the public entry points, as a host would, and
 * each item's view control kind compared. The engine runner replays the same
 * cases for everything else.
 */

const root = new URL('../../../../fixtures/', import.meta.url);
const read = <T>(behaviour: string, file: string): T => JSON.parse(readFileSync(new URL(`${behaviour}/${file}`, root), 'utf8')) as T;

interface Case {
  readonly name: string;
  readonly loadMode: LoadMode;
  readonly controls: Readonly<Record<string, string>>;
}

describe('view conformance (INV-P-05, AC-01.2.2, AC-01.2.4)', () => {
  it('item-control: hints honoured where they fit, the count rule elsewhere', () => {
    const [testCase] = read<{ cases: readonly Case[] }>('item-control', 'scenario.json').cases;
    if (testCase === undefined) throw new Error('item-control has no case');
    const view = createView(createSession(read<Questionnaire>('item-control', 'questionnaire.json'), { loadMode: testCase.loadMode }), { idPrefix: 'c', locale: 'en' });
    const kinds = Object.fromEntries(flatten(view.getSnapshot().nodes).map((node) => [node.path, node.control]));
    expect(kinds).toEqual(testCase.controls);
  });

  it('unit-options: the permitted units, by display, in authored order', () => {
    const view = createView(createSession(read<Questionnaire>('unit-options', 'questionnaire.json'), { loadMode: 'lenient' }), { idPrefix: 'c', locale: 'en' });
    expect(find(view.getSnapshot(), 'weight', 'quantity').units.map((unit) => unit.label)).toEqual(['kilograms', 'pounds']);
  });
});
