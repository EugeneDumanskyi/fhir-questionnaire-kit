/**
 * Conformance fixtures for every supported `enableWhen` operator × question
 * type (M2 AC-1, NFR-Q-05, M2 plan D6): one directory per type, one dependent
 * item per operator. Generated because the fifty pairs are regular; the
 * expected results are *not* computed by the engine but read from the truth
 * table below, which states what each operator means for an answer that is
 * equal to, greater than or less than the expected value, or absent (plan D2).
 *
 *   node scripts/gen-conformance-fixtures.mjs          writes fixtures/enablewhen-<type>/
 *   node scripts/gen-conformance-fixtures.mjs --check  exits 1 if a committed file differs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const DEPENDENTS = { '=': 'eq', '!=': 'ne', '>': 'gt', '<': 'lt', '>=': 'ge', '<=': 'le', exists: 'exists' };

/** What each operator gives, by how the answer relates to the expected value (plan D2). `exists` is tested with `true`. */
const TRUTH = {
  equal: { '=': true, '!=': false, '>': false, '<': false, '>=': true, '<=': true, exists: true },
  greater: { '=': false, '!=': true, '>': true, '<': false, '>=': true, '<=': false, exists: true },
  less: { '=': false, '!=': true, '>': false, '<': true, '>=': false, '<=': true, exists: true },
  unequal: { '=': false, '!=': true, exists: true },
  none: { '=': false, '!=': true, '>': false, '<': false, '>=': false, '<=': false, exists: false },
};

const ORDERED = ['=', '!=', '>', '<', '>=', '<=', 'exists'];
const EQUALITY = ['=', '!=', 'exists'];
const CODE = { system: 'urn:fhirq:conformance', code: 'daily' };

/**
 * Per type: the R4 `answer[x]` key, the expected value, and answers that
 * relate to it in each way. Each answer is the domain `Answer` a host sends.
 */
const TYPES = {
  boolean: { key: 'answerBoolean', expected: true, operators: EQUALITY, answers: { equal: ['boolean', true], unequal: ['boolean', false] } },
  integer: { key: 'answerInteger', expected: 5, operators: ORDERED, answers: { equal: ['integer', 5], greater: ['integer', 7], less: ['integer', 2] } },
  decimal: { key: 'answerDecimal', expected: 2.5, operators: ORDERED, answers: { equal: ['decimal', 2.5], greater: ['decimal', 3.75], less: ['decimal', 1.25] } },
  date: {
    key: 'answerDate',
    expected: '2024-05-01',
    operators: ORDERED,
    answers: { equal: ['date', '2024-05-01'], greater: ['date', '2024-06-01'], less: ['date', '2024-04-01'] },
  },
  dateTime: {
    key: 'answerDateTime',
    expected: '2024-05-01T10:00:00Z',
    operators: ORDERED,
    // The equal answer is the same instant written in another offset.
    answers: { equal: ['dateTime', '2024-05-01T12:00:00+02:00'], greater: ['dateTime', '2024-05-01T10:30:00Z'], less: ['dateTime', '2024-05-01T09:00:00Z'] },
  },
  string: { key: 'answerString', expected: 'yes', operators: EQUALITY, answers: { equal: ['string', 'yes'], unequal: ['string', 'Yes'] } },
  text: { key: 'answerString', expected: 'twice a day', operators: EQUALITY, answers: { equal: ['string', 'twice a day'], unequal: ['string', 'twice a day '] } },
  choice: {
    key: 'answerCoding',
    expected: CODE,
    operators: EQUALITY,
    options: [{ valueCoding: { ...CODE, display: 'Daily' } }, { valueCoding: { system: CODE.system, code: 'never', display: 'Never' } }],
    answers: { equal: ['coding', { ...CODE, display: 'Every day' }], unequal: ['coding', { system: CODE.system, code: 'never' }] },
  },
  'open-choice': {
    key: 'answerCoding',
    expected: CODE,
    operators: EQUALITY,
    options: [{ valueCoding: { ...CODE, display: 'Daily' } }],
    // Free text never equals a coding, even when it spells the code (plan D3).
    answers: { equal: ['coding', CODE], unequal: ['string', 'daily'] },
  },
  quantity: {
    key: 'answerQuantity',
    expected: { value: 70, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
    operators: ORDERED,
    answers: {
      equal: ['quantity', { value: 70, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' }],
      greater: ['quantity', { value: 80, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' }],
      less: ['quantity', { value: 60, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' }],
    },
  },
};

function questionnaire(type, spec) {
  const question = { linkId: 'q', text: `${/^[aeiou]/.test(type) ? 'An' : 'A'} ${type} question`, type, ...(spec.options ? { answerOption: spec.options } : {}) };
  const dependents = spec.operators.map((operator) => ({
    linkId: DEPENDENTS[operator],
    text: `Shown when q ${operator}`,
    type: 'display',
    enableWhen: [{ question: 'q', operator, [operator === 'exists' ? 'answerBoolean' : spec.key]: operator === 'exists' ? true : spec.expected }],
  }));
  return {
    resourceType: 'Questionnaire',
    url: `urn:fhirq:conformance:enablewhen-${type}`,
    version: '1',
    status: 'draft',
    title: `enableWhen operators on ${type}`,
    item: [question, ...dependents],
  };
}

function scenario(type, spec) {
  const enabledFor = (relation) => ['q', ...spec.operators.filter((operator) => TRUTH[relation][operator]).map((operator) => DEPENDENTS[operator])];
  const steps = Object.entries(spec.answers).map(([relation, [kind, value]]) => ({
    name: `answer ${relation === 'unequal' ? 'not equal to' : `${relation} ${relation === 'equal' ? 'to' : 'than'}`} the expected value`,
    command: { type: 'SetAnswer', path: 'q', answers: [{ kind, value }] },
    result: { outcome: 'applied' },
    enabled: enabledFor(relation),
  }));
  return {
    behaviour: `enableWhen operators on ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type} question (AC-02.1.3, plan D2 and D3)`,
    cases: [
      {
        name: `operators on ${type}`,
        loadMode: 'strict',
        enabled: enabledFor('none'),
        steps: [...steps, { name: 'cleared: unanswered', command: { type: 'ClearAnswer', path: 'q' }, result: { outcome: 'applied' }, enabled: enabledFor('none') }],
      },
    ],
  };
}

const readme = (type, spec) => `# \`enablewhen-${type}\`

**Behaviour:** every \`enableWhen\` operator the kit supports on ${/^[aeiou]/.test(type) ? 'an' : 'a'} \`${type}\` question (${spec.operators.map((operator) => `\`${operator}\``).join(', ')}), each gating one \`display\` item.

**Criteria:** AC-02.1.3, NFR-Q-05, M2 AC-1. **Spec:** FHIR R4 \`Questionnaire.item.enableWhen\` and the operator value set; the kit's reading of the operator text and of each type's comparison is \`06-roadmap.md\` M2 plan decisions D2 and D3.

**Generated** by \`scripts/gen-conformance-fixtures.mjs\` from a truth table, not from the engine. Do not edit by hand: change the generator and rerun it.
`;

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function files() {
  return Object.entries(TYPES).flatMap(([type, spec]) => [
    [`fixtures/enablewhen-${type}/questionnaire.json`, json(questionnaire(type, spec))],
    [`fixtures/enablewhen-${type}/scenario.json`, json(scenario(type, spec))],
    [`fixtures/enablewhen-${type}/README.md`, readme(type, spec)],
  ]);
}

export const PAIRS = Object.entries(TYPES).flatMap(([type, spec]) => spec.operators.map((operator) => [type, operator]));

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const [path, text] of files()) {
    if (check) {
      let committed = '';
      try {
        committed = readFileSync(`${root}${path}`, 'utf8');
      } catch {
        committed = '';
      }
      if (committed !== text) {
        console.error(`stale: ${path}`);
        stale = true;
      }
    } else {
      mkdirSync(`${root}${path.slice(0, path.lastIndexOf('/'))}`, { recursive: true });
      writeFileSync(`${root}${path}`, text);
    }
  }
  if (stale) process.exit(1);
  if (!check) console.log(`wrote ${files().length} files for ${PAIRS.length} operator × type pairs`);
}
