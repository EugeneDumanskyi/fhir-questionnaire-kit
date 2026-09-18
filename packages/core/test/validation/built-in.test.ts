import { describe, expect, it } from 'vitest';

import { createSession, itemPath, type Answer, type ItemPath, type Questionnaire, type Session } from '../../src/index.js';
import { bool, questionnaire, text } from '../slice.js';

const EXT = 'http://hl7.org/fhir/StructureDefinition/';
const at = (path: string) => path as ItemPath;
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: at(path), answers });
const issues = (session: Session) => session.getSnapshot().issues.map((issue) => [issue.path, issue.code, issue.params['limit'] ?? null]);
const decimal = (value: number): Answer[] => [{ kind: 'decimal', value }];
const integer = (value: number): Answer[] => [{ kind: 'integer', value }];
const date = (value: string): Answer[] => [{ kind: 'date', value }];

const CONSTRAINED: Questionnaire = questionnaire([
  { linkId: 'name', type: 'string', maxLength: 5 },
  { linkId: 'notes', type: 'text', maxLength: 3 },
  {
    linkId: 'weight',
    type: 'decimal',
    extension: [
      { url: `${EXT}minValue`, valueDecimal: 0.5 },
      { url: `${EXT}maxValue`, valueInteger: 300 },
      { url: `${EXT}maxDecimalPlaces`, valueInteger: 1 },
    ],
  },
  { linkId: 'age', type: 'integer', extension: [{ url: `${EXT}minValue`, valueInteger: 18 }] },
  { linkId: 'seen', type: 'date', extension: [{ url: `${EXT}minValue`, valueDate: '2020-01-01' }, { url: `${EXT}maxValue`, valueDate: '2025-12-31' }] },
  { linkId: 'at', type: 'dateTime', extension: [{ url: `${EXT}maxValue`, valueDateTime: '2026-01-01T00:00:00Z' }] },
  { linkId: 'dose', type: 'quantity', extension: [{ url: `${EXT}maxDecimalPlaces`, valueInteger: 2 }] },
  { linkId: 'tags', type: 'string', repeats: true, extension: [{ url: `${EXT}questionnaire-minOccurs`, valueInteger: 2 }, { url: `${EXT}questionnaire-maxOccurs`, valueInteger: 3 }] },
]);

describe('built-in rules (BC3, AC-04.2.1)', () => {
  it('holds a valid form to no issue', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'tags', text('a').concat(text('b')));
    expect(session.getSnapshot().issues).toEqual([]);
  });

  it('names the authored limit and never the entered value, in document order (INV-V-06, M3 plan D1)', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'name', text('abcdef'));
    set(session, 'notes', text('ab😀'));
    set(session, 'weight', decimal(0.25));
    set(session, 'age', integer(17));
    set(session, 'seen', date('2019-12-31'));
    set(session, 'at', [{ kind: 'dateTime', value: '2026-01-01T01:00:00+02:00' }]);
    set(session, 'dose', [{ kind: 'quantity', value: { value: 1.005, unit: 'mg' } }]);
    set(session, 'tags', text('a').concat(text('b'), text('c'), text('d')));
    expect(issues(session)).toEqual([
      ['name', 'max-length', 5],
      ['weight', 'max-decimal-places', 1],
      ['weight', 'min-value', 0.5],
      ['age', 'min-value', 18],
      ['seen', 'min-value', '2020-01-01'],
      ['dose', 'max-decimal-places', 2],
      ['tags', 'max-occurs', 3],
    ]);
    const [first] = session.getSnapshot().issues;
    expect(first).toEqual({ code: 'max-length', severity: 'error', path: 'name', linkId: 'name', message: 'max-length', params: { limit: 5 } });
    expect(JSON.stringify(session.getSnapshot().issues)).not.toContain('abcdef');
  });

  it('counts code points, so an emoji is one character', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'notes', text('ab😀'));
    expect(issues(session)).toContainEqual(['tags', 'min-occurs', 2]);
    expect(issues(session).filter(([path]) => path === 'notes')).toEqual([]);
  });

  it('raises a maximum, and a dateTime range compared as instants', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'weight', decimal(300.5));
    set(session, 'at', [{ kind: 'dateTime', value: '2026-01-01T01:00:00+00:00' }]);
    set(session, 'seen', date('2026-01-01'));
    expect(issues(session).filter(([path]) => path !== 'tags')).toEqual([
      ['weight', 'max-value', 300],
      ['seen', 'max-value', '2025-12-31'],
      ['at', 'max-value', '2026-01-01T00:00:00Z'],
    ]);
  });

  it('raises nothing for a date whose precision differs from its limit (M3 plan D8)', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'seen', date('2019'));
    set(session, 'at', [{ kind: 'dateTime', value: '2027-03' }]);
    expect(issues(session).filter(([path]) => path === 'seen' || path === 'at')).toEqual([]);
  });

  it('counts decimal places in exponent notation too', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'weight', decimal(1.5e-7));
    expect(issues(session)).toContainEqual(['weight', 'max-decimal-places', 1]);
    set(session, 'weight', decimal(2e2));
    expect(issues(session).filter(([path]) => path === 'weight')).toEqual([]);
  });

  it('keeps an invalid answer rather than discarding or coercing it (INV-V-02)', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'name', text('abcdefgh'));
    expect(session.getSnapshot().nodes.find((node) => node.path === 'name')?.answers).toEqual(text('abcdefgh'));
  });

  it('requires a unit on a quantity (INV-V-08, AC-01.2.4); a code is a unit too', () => {
    const session = createSession(CONSTRAINED);
    set(session, 'dose', [{ kind: 'quantity', value: { value: 5 } }]);
    expect(issues(session)).toContainEqual(['dose', 'unit-missing', null]);
    set(session, 'dose', [{ kind: 'quantity', value: { value: 5, system: 'http://unitsofmeasure.org', code: 'mg' } }]);
    expect(issues(session).filter(([path]) => path === 'dose')).toEqual([]);
  });

  it('counts a repeating group by its instances and raises min-occurs and max-occurs (SM-05)', () => {
    const session = createSession(
      questionnaire([
        {
          linkId: 'meds',
          type: 'group',
          repeats: true,
          extension: [{ url: `${EXT}questionnaire-minOccurs`, valueInteger: 2 }],
          item: [{ linkId: 'name', type: 'string' }],
        },
      ]),
    );
    expect(issues(session)).toEqual([['meds', 'min-occurs', 2]]);
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    expect(issues(session)).toEqual([]);
    session.dispatch({ type: 'RemoveRepeatInstance', path: itemPath('meds'), ordinal: 0 });
    session.dispatch({ type: 'RemoveRepeatInstance', path: itemPath('meds'), ordinal: 1 });
    expect(issues(session)).toEqual([['meds', 'min-occurs', 2]]);
  });

  it('holds a required group to an answered descendant, in any instance, and ignores display items', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'note', type: 'display', text: 'Read this' },
        { linkId: 'meds', type: 'group', repeats: true, required: true, item: [{ linkId: 'name', type: 'string' }] },
      ]),
    );
    expect(issues(session)).toEqual([['meds', 'required', null]]);
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    set(session, 'meds[1]/name', text('aspirin'));
    expect(issues(session)).toEqual([]);
  });

  it('never raises an issue on a disabled node or anything under it (INV-V-01)', () => {
    const session = createSession(
      questionnaire([
        { linkId: 'gate', type: 'boolean' },
        {
          linkId: 'details',
          type: 'group',
          required: true,
          enableWhen: [{ question: 'gate', operator: '=', answerBoolean: true }],
          enableBehavior: 'all',
          item: [{ linkId: 'name', type: 'string', required: true, maxLength: 2 }],
        },
      ]),
    );
    set(session, 'gate', bool(true));
    set(session, 'details/name', text('abc'));
    expect(issues(session)).toEqual([['details/name', 'max-length', 2]]);
    set(session, 'gate', bool(false));
    expect(issues(session)).toEqual([]);
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });
  });

  it('orders issues across repeat instances by position, not ordinal (INV-V-06)', () => {
    const session = createSession(
      questionnaire([{ linkId: 'meds', type: 'group', repeats: true, item: [{ linkId: 'name', type: 'string', required: true }] }]),
    );
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    session.dispatch({ type: 'RemoveRepeatInstance', path: itemPath('meds'), ordinal: 1 });
    expect(issues(session).map(([path]) => path)).toEqual(['meds[0]/name', 'meds[2]/name']);
  });
});
