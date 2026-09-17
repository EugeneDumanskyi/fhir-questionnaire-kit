import { describe, expect, it } from 'vitest';

import { parseQuestionnaire, type ParseResult } from '../../src/fhir/r4/parse.js';
import type { ItemInput } from '../../src/kernel/input.js';

const SDC = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/';
const CORE = 'http://hl7.org/fhir/StructureDefinition/';

const questionnaire = (item: readonly unknown[], extra: Record<string, unknown> = {}) => ({
  resourceType: 'Questionnaire',
  status: 'draft',
  ...extra,
  item,
});

function parsed(json: unknown): ItemInput[] {
  const result = parseQuestionnaire(json);
  if (!result.ok) throw new Error(JSON.stringify(result.findings));
  return [...result.input.items];
}

function findings(json: unknown): { code: string; path: string | null; detail: string | null }[] {
  const result: ParseResult = parseQuestionnaire(json);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.findings.map(({ code, path, detail, severity }) => {
    expect(severity).toBe('error');
    return { code, path, detail };
  });
}

describe('an R4 Questionnaire becomes version-neutral input (ADR-0016)', () => {
  it('maps items, conditions, options and the canonical', () => {
    const result = parseQuestionnaire(
      questionnaire(
        [
          { linkId: 'smoker', text: 'Do you smoke?', type: 'boolean', required: true },
          {
            linkId: 'amount',
            type: 'integer',
            maxLength: 3,
            enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }],
          },
          {
            linkId: 'kind',
            type: 'choice',
            repeats: true,
            enableBehavior: 'any',
            enableWhen: [
              { question: 'smoker', operator: 'exists', answerBoolean: true },
              { question: 'amount', operator: '>=', answerInteger: 10 },
            ],
            answerOption: [
              { valueCoding: { system: 'urn:kinds', code: 'cig', display: 'Cigarettes', version: '1', userSelected: false } },
              { valueString: 'Other' },
              { valueInteger: 3 },
              { valueDate: '2024-05' },
            ],
          },
        ],
        { url: 'https://example.org/q', version: '2' },
      ),
    );
    expect(result).toEqual({
      ok: true,
      input: {
        url: 'https://example.org/q',
        version: '2',
        expressions: [],
        items: [
          expect.objectContaining({ linkId: 'smoker', type: 'boolean', authoredType: 'boolean', text: 'Do you smoke?', required: true, repeats: false, enableWhen: [], enableBehavior: null }),
          expect.objectContaining({
            linkId: 'amount',
            text: '',
            maxLength: 3,
            enableWhen: [{ question: 'smoker', operator: '=', answer: { kind: 'boolean', value: true }, answerType: 'Boolean' }],
          }),
          expect.objectContaining({
            linkId: 'kind',
            repeats: true,
            enableBehavior: 'any',
            enableWhen: [
              { question: 'smoker', operator: 'exists', answer: { kind: 'boolean', value: true }, answerType: 'Boolean' },
              { question: 'amount', operator: '>=', answer: { kind: 'integer', value: 10 }, answerType: 'Integer' },
            ],
            options: [
              { value: { kind: 'coding', value: { system: 'urn:kinds', code: 'cig', display: 'Cigarettes' } }, valueType: 'Coding' },
              { value: { kind: 'string', value: 'Other' }, valueType: 'String' },
              { value: { kind: 'integer', value: 3 }, valueType: 'Integer' },
              { value: { kind: 'date', value: '2024-05' }, valueType: 'Date' },
            ],
            valueSet: null,
            hasInitial: false,
          }),
        ],
      },
    });
  });

  it('reads an empty questionnaire and one with no canonical', () => {
    expect(parseQuestionnaire({ resourceType: 'Questionnaire' })).toEqual({ ok: true, input: { url: null, version: null, items: [], expressions: [] } });
  });

  it('keeps nesting as children, and nothing is flattened', () => {
    const [group] = parsed(questionnaire([{ linkId: 'g', type: 'group', repeats: true, item: [{ linkId: 'g/1', type: 'string' }] }]));
    expect(group?.children.map((child) => child.linkId)).toEqual(['g/1']);
  });

  it.each([
    ['answerDecimal', 1.5, { kind: 'decimal', value: 1.5 }],
    ['answerDate', '2024', { kind: 'date', value: '2024' }],
    ['answerDateTime', '2024-05-01T10:00:00+01:00', { kind: 'dateTime', value: '2024-05-01T10:00:00+01:00' }],
    ['answerString', 'yes', { kind: 'string', value: 'yes' }],
    ['answerQuantity', { value: 70, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg', id: 'q' }, { kind: 'quantity', value: { value: 70, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' } }],
    ['answerTime', '10:00:00', null],
    ['answerReference', { reference: 'Patient/1' }, null],
    ['answerQuantity', { value: 5, comparator: '<' }, null],
  ])('maps %s to its domain answer', (key, value, answer) => {
    const [, item] = parsed(questionnaire([{ linkId: 'a', type: 'string' }, { linkId: 'b', type: 'string', enableWhen: [{ question: 'a', operator: '=', [key]: value }] }]));
    expect(item?.enableWhen[0]?.answer).toEqual(answer);
    expect(item?.enableWhen[0]?.answerType).toBe(key.slice('answer'.length));
  });

  it('records unsupported item types and option values instead of judging them (the compiler does)', () => {
    const items = parsed(
      questionnaire([
        { linkId: 'when', type: 'time' },
        { linkId: 'site', type: 'url' },
        { linkId: 'file', type: 'attachment' },
        { linkId: 'ref', type: 'reference' },
        { linkId: 'q', type: 'question' },
        { linkId: 'pick', type: 'choice', answerOption: [{ valueTime: '10:00:00' }, { valueReference: { reference: 'x' } }] },
      ]),
    );
    expect(items.map((item) => [item.type, item.authoredType])).toEqual([
      [null, 'time'], [null, 'url'], [null, 'attachment'], [null, 'reference'], [null, 'question'], ['choice', 'choice'],
    ]);
    expect(items[5]?.options).toEqual([{ value: null, valueType: 'Time' }, { value: null, valueType: 'Reference' }]);
  });

  it('records a value set, initial values and items under a question', () => {
    const [item, other] = parsed(
      questionnaire([
        { linkId: 'a', type: 'choice', answerValueSet: 'http://example.org/vs', initial: [{ valueCoding: { code: 'x' } }], item: [{ linkId: 'a1', type: 'string' }] },
        { linkId: 'b', type: 'choice', initial: [], answerOption: [{ valueString: 'x', initialSelected: true }] },
      ]),
    );
    expect(item).toMatchObject({ valueSet: 'http://example.org/vs', hasInitial: true, children: [{ linkId: 'a1' }] });
    expect(other?.hasInitial).toBe(true);
  });
});

describe('extensions of interest, by registered HL7 and SDC URL only', () => {
  it('reads cardinality, item control and rendering XHTML', () => {
    const [group, pick] = parsed(
      questionnaire([
        {
          linkId: 'meds',
          type: 'group',
          repeats: true,
          extension: [
            { url: `${CORE}questionnaire-minOccurs`, valueInteger: 1 },
            { url: `${CORE}questionnaire-maxOccurs`, valueInteger: 5 },
            { url: 'http://example.org/unknown', valueString: 'ignored' },
          ],
          item: [{ linkId: 'name', type: 'string' }],
        },
        {
          linkId: 'pick',
          type: 'choice',
          _text: { extension: [{ url: `${CORE}rendering-xhtml`, valueString: '<b>Pick</b>' }] },
          extension: [
            {
              url: `${CORE}questionnaire-itemControl`,
              valueCodeableConcept: { coding: [{ system: 'urn:other', code: 'slider' }, { system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'drop-down' }] },
            },
          ],
        },
      ]),
    );
    expect(group).toMatchObject({ minOccurs: 1, maxOccurs: 5, itemControl: null, renderingXhtml: null });
    expect(pick).toMatchObject({ minOccurs: null, maxOccurs: null, itemControl: 'drop-down', renderingXhtml: '<b>Pick</b>' });
  });

  it('reads an item control coding that names no system, and ignores a malformed one', () => {
    const control = (valueCodeableConcept: unknown) =>
      parsed(questionnaire([{ linkId: 'a', type: 'choice', extension: [{ url: `${CORE}questionnaire-itemControl`, valueCodeableConcept }] }]))[0]?.itemControl;
    expect(control({ coding: [{ code: 'radio-button' }] })).toBe('radio-button');
    expect(control({ coding: 'radio-button' })).toBeNull();
    expect(control(undefined)).toBeNull();
  });

  it('records every expression extension on items and on the questionnaire', () => {
    const result = parseQuestionnaire(
      questionnaire(
        [
          {
            linkId: 'bmi',
            type: 'decimal',
            extension: [
              { url: `${SDC}sdc-questionnaire-calculatedExpression`, valueExpression: { language: 'text/fhirpath', expression: '%weight / %height.power(2)' } },
              { url: `${SDC}sdc-questionnaire-enableWhenExpression`, valueExpression: { language: 'text/fhirpath' } },
              { url: `${SDC}sdc-questionnaire-answerExpression`, valueExpression: { language: 'text/fhirpath', expression: 'x' } },
              { url: `${SDC}sdc-questionnaire-candidateExpression`, valueExpression: { language: 'text/fhirpath', expression: 'x' } },
              { url: `${SDC}sdc-questionnaire-initialExpression`, valueExpression: { language: 'text/fhirpath', expression: 'x' } },
            ],
          },
        ],
        {
          extension: [
            { url: `${CORE}variable`, valueExpression: { name: 'weight', language: 'text/fhirpath', expression: 'x' } },
            { url: `${SDC}sdc-questionnaire-launchContext`, extension: [{ url: 'name', valueCoding: { code: 'patient' } }] },
          ],
        },
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.expressions).toEqual([
      { kind: 'variable', url: `${CORE}variable`, language: 'text/fhirpath', expression: 'x' },
      { kind: 'launchContext', url: `${SDC}sdc-questionnaire-launchContext`, language: null, expression: null },
    ]);
    expect(result.input.items[0]?.expressions.map((use) => [use.kind, use.expression])).toEqual([
      ['calculated', '%weight / %height.power(2)'],
      ['enableWhen', null],
      ['answer', 'x'],
      ['candidate', 'x'],
      ['initial', 'x'],
    ]);
  });
});

describe('INV-D-01: anything that is not an R4 Questionnaire is rejected in both modes, with every finding', () => {
  it.each([
    ['null', null, 'resourceType'],
    ['an array', [], 'resourceType'],
    ['a string', 'Questionnaire', 'resourceType'],
    ['no resourceType', { item: [] }, 'resourceType'],
    ['another resource', { resourceType: 'QuestionnaireResponse' }, 'QuestionnaireResponse'],
  ])('rejects %s as not a Questionnaire', (_, json, detail) => {
    expect(findings(json)).toEqual([{ code: 'not-a-questionnaire', path: null, detail }]);
  });

  it.each([
    ['a declared R5 fhirVersion', { fhirVersion: '5.0.0' }, 'fhirVersion'],
    ['a fhirVersion that is not a string', { fhirVersion: 4 }, 'fhirVersion'],
    ['R5 versionAlgorithm', { versionAlgorithmString: 'semver' }, 'versionAlgorithmString'],
    ['R5 copyrightLabel', { copyrightLabel: '(c)' }, 'copyrightLabel'],
  ])('rejects %s as not R4', (_, extra, detail) => {
    expect(findings(questionnaire([], extra))).toEqual([{ code: 'not-r4', path: null, detail }]);
  });

  it('accepts a declared 4.0.x fhirVersion', () => {
    expect(parseQuestionnaire(questionnaire([], { fhirVersion: '4.0.1' })).ok).toBe(true);
    expect(parseQuestionnaire(questionnaire([], { fhirVersion: '4.0' })).ok).toBe(true);
  });

  it('rejects R5-shaped items, naming the linkId path', () => {
    expect(
      findings(
        questionnaire([
          { linkId: 'a', type: 'coding' },
          { linkId: 'g', type: 'group', item: [{ linkId: 'b', type: 'string', disabledDisplay: 'hidden' }, { linkId: 'c', type: 'choice', answerConstraint: 'optionsOnly' }] },
        ]),
      ),
    ).toEqual([
      { code: 'not-r4', path: 'a', detail: 'coding' },
      { code: 'not-r4', path: 'g/b', detail: 'disabledDisplay' },
      { code: 'not-r4', path: 'g/c', detail: 'answerConstraint' },
    ]);
  });

  it('rejects every modifier extension, which R4 forbids a processor to ignore', () => {
    expect(
      findings(
        questionnaire(
          [
            {
              linkId: 'a',
              type: 'choice',
              modifierExtension: [{ url: 'urn:item-mod' }],
              enableWhen: [{ question: 'b', operator: '=', answerString: 'x', modifierExtension: [{ url: 'urn:when-mod' }] }],
              answerOption: [{ valueString: 'x', modifierExtension: [{}] }],
            },
            { linkId: 'b', type: 'string', modifierExtension: 'nope' },
          ],
          { modifierExtension: [{ url: 'urn:root-mod' }] },
        ),
      ),
    ).toEqual([
      { code: 'modifier-extension', path: null, detail: 'urn:root-mod' },
      { code: 'modifier-extension', path: 'a', detail: 'urn:item-mod' },
      { code: 'modifier-extension', path: 'a', detail: 'urn:when-mod' },
      { code: 'modifier-extension', path: 'a', detail: 'modifierExtension' },
      { code: 'malformed', path: 'b', detail: 'modifierExtension' },
    ]);
  });

  it.each([
    ['que-1: a group with no items', { linkId: 'g', type: 'group' }],
    ['que-1: a display with items', { linkId: 'd', type: 'display', item: [{ linkId: 'x', type: 'string' }] }],
    ['que-4: both answerOption and answerValueSet', { linkId: 'c', type: 'choice', answerOption: [{ valueString: 'a' }], answerValueSet: 'urn:vs' }],
    ['que-6: required on a display', { linkId: 'd', type: 'display', required: false }],
    ['que-6: repeats on a display', { linkId: 'd', type: 'display', repeats: true }],
    ['que-10: maxLength on a choice', { linkId: 'c', type: 'choice', maxLength: 10 }],
  ])('rejects %s', (name, item) => {
    const key = name.slice(0, name.indexOf(':'));
    expect(findings(questionnaire([item]))).toEqual([{ code: 'r4-constraint', path: item.linkId, detail: key }]);
  });

  it('rejects que-7: exists with an answer that is not a boolean', () => {
    expect(
      findings(questionnaire([{ linkId: 'a', type: 'string' }, { linkId: 'b', type: 'string', enableWhen: [{ question: 'a', operator: 'exists', answerString: 'x' }] }])),
    ).toEqual([{ code: 'r4-constraint', path: 'b', detail: 'que-7' }]);
  });

  it.each([
    ['a missing linkId', [{ type: 'string' }], null, 'item[0].linkId'],
    ['an empty linkId', [{ linkId: '', type: 'string' }], null, 'item[0].linkId'],
    ['an item that is not an object', [{ linkId: 'a', type: 'string' }, 'b'], null, 'item[1]'],
    ['a missing type', [{ linkId: 'a' }], 'a', 'type'],
    ['a type R4 does not define', [{ linkId: 'a', type: 'number' }], 'a', 'number'],
    ['text that is not a string', [{ linkId: 'a', type: 'string', text: 3 }], 'a', 'text'],
    ['required that is not a boolean', [{ linkId: 'a', type: 'string', required: 'yes' }], 'a', 'required'],
    ['a fractional maxLength', [{ linkId: 'a', type: 'string', maxLength: 1.5 }], 'a', 'maxLength'],
    ['an enableBehavior R4 does not define', [{ linkId: 'a', type: 'string', enableBehavior: 'none' }], 'a', 'enableBehavior'],
    ['enableWhen that is not a list', [{ linkId: 'a', type: 'string', enableWhen: {} }], 'a', 'enableWhen'],
    ['a condition with no question', [{ linkId: 'a', type: 'string', enableWhen: [{ operator: '=', answerBoolean: true }] }], 'a', 'enableWhen[0].question'],
    ['a condition that is not an object', [{ linkId: 'a', type: 'string', enableWhen: ['b'] }], 'a', 'enableWhen[0].question'],
    ['an operator R4 does not define', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '==', answerBoolean: true }] }], 'a', 'enableWhen[0].operator'],
    ['a condition with no answer', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=' }] }], 'a', 'enableWhen[0].answer[x]'],
    ['a condition with two answers', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerBoolean: true, answerString: 'x' }] }], 'a', 'enableWhen[0].answer[x]'],
    ['an answer type R4 does not define', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerUri: 'x' }] }], 'a', 'enableWhen[0].answer[x]'],
    ['an answer of the wrong JSON type', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerInteger: '1' }] }], 'a', 'enableWhen[0].answerInteger'],
    ['an impossible answerDate', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerDate: '2024-02-30' }] }], 'a', 'enableWhen[0].answerDate'],
    ['an answerCoding with nothing to compare', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerCoding: { system: 'urn:x' } }] }], 'a', 'enableWhen[0].answerCoding'],
    ['an answerCoding that is not an object', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerCoding: 'x' }] }], 'a', 'enableWhen[0].answerCoding'],
    ['an answerQuantity with no value', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerQuantity: { unit: 'kg' } }] }], 'a', 'enableWhen[0].answerQuantity'],
    ['an answerQuantity that is not an object', [{ linkId: 'a', type: 'string', enableWhen: [{ question: 'b', operator: '=', answerQuantity: 5 }] }], 'a', 'enableWhen[0].answerQuantity'],
    ['an option with no value', [{ linkId: 'a', type: 'choice', answerOption: [{ initialSelected: true }] }], 'a', 'answerOption[0]'],
    ['an option value type R4 does not define', [{ linkId: 'a', type: 'choice', answerOption: [{ valueBoolean: true }] }], 'a', 'answerOption[0]'],
    ['an option that is not an object', [{ linkId: 'a', type: 'choice', answerOption: ['x'] }], 'a', 'answerOption[0]'],
    ['an empty option string', [{ linkId: 'a', type: 'choice', answerOption: [{ valueString: '' }] }], 'a', 'answerOption[0]'],
    ['a negative maxOccurs', [{ linkId: 'a', type: 'group', item: [{ linkId: 'b', type: 'string' }], extension: [{ url: `${CORE}questionnaire-maxOccurs`, valueInteger: -1 }] }], 'a', `${CORE}questionnaire-maxOccurs`],
    ['a minOccurs that is not an integer', [{ linkId: 'a', type: 'group', item: [{ linkId: 'b', type: 'string' }], extension: [{ url: `${CORE}questionnaire-minOccurs`, valueString: '1' }] }], 'a', `${CORE}questionnaire-minOccurs`],
    ['a valueExpression that is not an object', [{ linkId: 'a', type: 'string', extension: [{ url: `${SDC}sdc-questionnaire-calculatedExpression`, valueExpression: 'x' }] }], 'a', `${SDC}sdc-questionnaire-calculatedExpression`],
  ])('rejects %s as malformed', (_, item, path, detail) => {
    expect(findings(questionnaire(item))).toEqual([{ code: 'malformed', path, detail }]);
  });

  it.each([
    ['url', { url: 7 }],
    ['version', { version: false }],
    ['item', { item: {} }],
  ])('rejects a root %s of the wrong JSON type', (detail, extra) => {
    expect(findings({ resourceType: 'Questionnaire', ...extra })).toEqual([{ code: 'malformed', path: null, detail }]);
  });

  it('collects every finding across the tree rather than stopping at the first', () => {
    expect(
      findings(
        questionnaire(
          [
            { linkId: 'g', type: 'group', item: [{ linkId: 'x', type: 'bogus' }, { linkId: 'y', type: 'display', required: true }] },
            { type: 'string' },
          ],
          { fhirVersion: '3.0.2' },
        ),
      ),
    ).toEqual([
      { code: 'not-r4', path: null, detail: 'fhirVersion' },
      { code: 'malformed', path: 'g/x', detail: 'bogus' },
      { code: 'r4-constraint', path: 'g/y', detail: 'que-6' },
      { code: 'malformed', path: null, detail: 'item[1].linkId' },
    ]);
  });

  it('encodes the linkId path of a finding, and never includes an authored answer', () => {
    const result = findings(questionnaire([{ linkId: 'a/b c', type: 'string', enableWhen: [{ question: 'q', operator: '=', answerDate: 'secret-2024' }] }]));
    expect(result).toEqual([{ code: 'malformed', path: 'a%2Fb%20c', detail: 'enableWhen[0].answerDate' }]);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
