import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createSession, itemPath, type Questionnaire } from '../src/index.js';
import { createView, type ControlKind, type ViewModel } from '../src/view/index.js';
import { ALLOWED_COINCIDENCES, deniedBy, HTML_ELEMENTS, INPUT_TYPES } from './deny-lists.js';
import { EXT, find, flatten, hint, options } from './view/helpers.js';

const demo = JSON.parse(readFileSync(new URL('../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8')) as Questionnaire;

/** Items for every control kind the demo lacks, in lenient mode so the placeholder shows too. */
const EXTRA: NonNullable<Questionnaire['item']> = [
  { linkId: 'tags', type: 'open-choice', text: 'Tags', repeats: true, answerOption: options(7) },
  { linkId: 'pick', type: 'choice', text: 'Pick', answerOption: options(3), extension: [hint('drop-down')] },
  { linkId: 'many', type: 'choice', text: 'Many', answerOption: options(8) },
  { linkId: 'checks', type: 'choice', text: 'Checks', repeats: true, answerOption: options(2), extension: [hint('check-box')] },
  { linkId: 'looked-up', type: 'choice', text: 'Looked up', answerValueSet: 'urn:vs' },
  { linkId: 'names', type: 'string', text: 'Names', repeats: true },
  { linkId: 'when', type: 'dateTime', text: 'When' },
  {
    linkId: 'dose',
    type: 'quantity',
    text: 'Dose',
    extension: [{ url: `${EXT}questionnaire-unitOption`, valueCoding: { system: 'http://unitsofmeasure.org', code: 'mg', display: 'mg' } }],
  },
  {
    linkId: 'total',
    type: 'integer',
    text: 'Total',
    extension: [{ url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression', valueExpression: { language: 'text/fhirpath', expression: '1' } }],
  },
  { linkId: 'upload', type: 'attachment', text: 'Upload' },
  { linkId: 'limited', type: 'group', text: 'Limited', repeats: true, extension: [{ url: `${EXT}questionnaire-maxOccurs`, valueInteger: 1 }], item: [{ linkId: 'x', type: 'boolean', text: 'X' }] },
];

/**
 * Every state the view can show, over every control kind: initial, answered,
 * typed and not yet a value, surfaced, options pending and failed, repeats
 * added, at their maximum and removed, a form-level issue, refused, completed.
 */
async function models(): Promise<ViewModel[]> {
  const session = createSession(
    { ...demo, item: [...(demo.item ?? []), ...EXTRA] },
    {
      loadMode: 'lenient',
      resolver: () => Promise.reject(new Error('down')),
      rules: [{ inputs: ['names'], targets: [], check: () => 'form-level' }],
    },
  );
  const view = createView(session, { idPrefix: 'fq', locale: 'en', timeZone: 'UTC', messages: { 'form-level': 'Check the whole form' } });
  const seen = [view.getSnapshot()];
  const step = (act: (model: ViewModel) => void) => {
    act(view.getSnapshot());
    seen.push(view.getSnapshot());
  };
  step((model) => find(model, 'pain/pain-now', 'yes-no').set('true'));
  step((model) => find(model, 'visit/visit-date', 'calendar-date').set('soon'));
  step((model) => find(model, 'visit/visit-date', 'calendar-date').leave());
  step((model) => find(model, 'tags', 'multi-list').toggle('1'));
  step((model) => find(model, 'tags', 'multi-list').setOther('mine'));
  step((model) => find(model, 'pick', 'single-menu').set('0'));
  step((model) => find(model, 'names', 'short-text').setAt(0, 'Ann'));
  step((model) => find(model, 'dose', 'quantity').setUnit('0'));
  step((model) => find(model, 'medicine', 'repeating-group').add());
  step((model) => find(model, 'medicine', 'repeating-group').instances[0]?.remove());
  await Promise.resolve();
  await Promise.resolve();
  seen.push(view.getSnapshot());
  step(() => session.dispatch({ type: 'RequestCompletion' }));
  step(() => session.dispatch({ type: 'SetAnswer', path: itemPath('visit', 'visit-date'), answers: [{ kind: 'date', value: '2026-10-01' }] }));
  return seen;
}

/**
 * Every own key reachable from the model, with the path it was found at. A
 * node's `value` is the engine's domain value carried as it is (ADR-0020): an
 * `Answer`, a `Coding` or a `Quantity`, whose fields are FHIR's, not the
 * view's. The walk records `value` and does not go into it.
 */
function fieldNames(value: unknown, at = 'model', out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    value.forEach((item) => fieldNames(item, `${at}[]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!out.has(key)) out.set(key, `${at}.${key}`);
      if (key !== 'value') fieldNames(child, `${at}.${key}`, out);
    }
  }
  return out;
}

/**
 * The field names and control kinds across every model. Each test that reads
 * them builds them: StrykerJS marks code run outside a test, `beforeAll`
 * included, as static and reruns the whole suite for each of its mutants.
 */
async function survey(): Promise<{ names: Map<string, string>; kinds: Set<ControlKind> }> {
  const names = new Map<string, string>();
  const kinds = new Set<ControlKind>();
  for (const model of await models()) {
    fieldNames(model, 'model', names);
    for (const node of flatten(model.nodes)) kinds.add(node.control);
  }
  return { names, kinds };
}

describe('view-model field list (ADR-0007 review rule, M1 AC-3, M5 AC-6)', () => {
  it('reaches every control kind', async () => {
    const { kinds } = await survey();
    const all: readonly ControlKind[] = [
      'yes-no', 'short-text', 'long-text', 'integer', 'decimal', 'calendar-date', 'date-time', 'quantity',
      'single-choice', 'single-list', 'single-menu', 'multi-choice', 'multi-list',
      'calculated', 'statement', 'group', 'repeating-group', 'unsupported',
    ];
    expect([...kinds].sort()).toEqual([...all].sort());
  });

  it('reaches every field the finished view produces, and no other', async () => {
    const { names } = await survey();
    expect([...names.keys()].sort()).toEqual(
      [
        'add', 'addLabel', 'announcement', 'canAdd', 'children', 'choose', 'clear', 'completed', 'control', 'cycle', 'description',
        'display', 'entries', 'entry', 'error', 'errorSummary', 'focusId', 'focusTarget', 'heading', 'headingId', 'id', 'ids',
        'instances', 'invalid', 'issues', 'key', 'label', 'labels', 'leave', 'message', 'nodes', 'notice', 'number', 'optionMessage',
        'optionState', 'options', 'other', 'path', 'reason', 'remove', 'removeLabel', 'required', 'requiredMarker',
        'retry', 'richLabel', 'rule', 'selected', 'set', 'setAt', 'setOther', 'setUnit', 'text', 'toggle', 'unit', 'units', 'value',
      ].sort(),
    );
  });

  it('has no field that names an element, an ARIA attribute or a CSS property', async () => {
    const { names } = await survey();
    const violations = [...names]
      .map(([name, where]) => ({ name, where, hit: deniedBy(name) }))
      .filter(({ name, hit }) => hit !== null && !(name in ALLOWED_COINCIDENCES));
    expect(violations).toEqual([]);
  });

  it('allows only the coincidences an ADR names, and each one is still in use', async () => {
    const { names } = await survey();
    for (const name of Object.keys(ALLOWED_COINCIDENCES)) {
      expect(deniedBy(name)).not.toBeNull();
      expect(names.has(name)).toBe(true);
    }
  });

  it('names control kinds semantically, never after an element or input type', async () => {
    const { kinds } = await survey();
    for (const kind of kinds) expect(HTML_ELEMENTS.has(kind) || INPUT_TYPES.has(kind), kind).toBe(false);
  });

  it('catches the drift it exists to catch', () => {
    expect(deniedBy('fieldset')).toBe('an HTML element');
    expect(deniedBy('ariaDescribedBy')).toBe('an ARIA attribute');
    expect(deniedBy('aria-invalid')).toBe('an ARIA attribute');
    expect(deniedBy('role')).toBe('an ARIA attribute');
    expect(deniedBy('display')).toBe('a CSS property');
    expect(deniedBy('insetInlineStart')).toBe('a CSS property');
    expect(deniedBy('invalid')).toBeNull();
    expect(deniedBy('errorSummary')).toBeNull();
  });
});
