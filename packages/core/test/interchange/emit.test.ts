import { describe, expect, it } from 'vitest';

import { createSession, emitResponse, FhirqError, itemPath, type Answer, type ItemPath, type Questionnaire, type Session } from '../../src/index.js';
import { bool, questionnaire, text } from '../slice.js';

const AUTHORED = '2026-09-18T09:30:00+02:00';
const at = (path: string) => path as ItemPath;
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: at(path), answers });
const emit = (session: Session) => emitResponse(session, { authored: AUTHORED });

const INTAKE: Questionnaire = {
  resourceType: 'Questionnaire',
  url: 'http://example.org/Questionnaire/intake',
  version: '2.1',
  status: 'active',
  item: [
    { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
    { linkId: 'amount', type: 'string', text: 'How much?', enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
    {
      linkId: 'meds',
      type: 'group',
      text: 'Medicines',
      repeats: true,
      item: [
        { linkId: 'name', type: 'string' },
        { linkId: 'dose', type: 'quantity' },
      ],
    },
    { linkId: 'about', type: 'group', item: [{ linkId: 'born', type: 'date' }, { linkId: 'seen', type: 'dateTime' }, { linkId: 'note', type: 'display', text: 'Thanks' }] },
    {
      linkId: 'colour',
      type: 'open-choice',
      answerOption: [{ valueCoding: { system: 'http://example.org/colours', code: 'red', display: 'Red' } }],
    },
    { linkId: 'tags', type: 'integer', repeats: true },
    { linkId: 'weight', type: 'decimal' },
  ],
};

describe('the emitted QuestionnaireResponse (US-05.1, BC4)', () => {
  it('holds the canonical, status, authored and nothing else when nothing is answered (AC-05.1.1, AC-05.1.2)', () => {
    expect(emit(createSession(INTAKE))).toEqual({
      resourceType: 'QuestionnaireResponse',
      questionnaire: 'http://example.org/Questionnaire/intake|2.1',
      status: 'in-progress',
      authored: AUTHORED,
    });
  });

  it('mirrors the definition for enabled, answered items, with every answer kind as R4 value[x] (INV-E-01, INV-E-03)', () => {
    const session = createSession(INTAKE);
    set(session, 'smoker', bool(true));
    set(session, 'amount', text('ten'));
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    set(session, 'meds[1]/name', text('aspirin'));
    set(session, 'meds[1]/dose', [{ kind: 'quantity', value: { value: 75, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' } }]);
    set(session, 'about/born', [{ kind: 'date', value: '1980-02' }]);
    set(session, 'about/seen', [{ kind: 'dateTime', value: '2026-09-18T08:00:00-05:00' }]);
    set(session, 'colour', [{ kind: 'coding', value: { system: 'http://example.org/colours', code: 'red', display: 'Red' } }]);
    set(session, 'tags', [{ kind: 'integer', value: 1 }, { kind: 'integer', value: 2 }]);
    set(session, 'weight', [{ kind: 'decimal', value: 70.5 }]);
    expect(emit(session).item).toEqual([
      { linkId: 'smoker', text: 'Do you smoke?', answer: [{ valueBoolean: true }] },
      { linkId: 'amount', text: 'How much?', answer: [{ valueString: 'ten' }] },
      {
        linkId: 'meds',
        text: 'Medicines',
        item: [
          { linkId: 'name', answer: [{ valueString: 'aspirin' }] },
          { linkId: 'dose', answer: [{ valueQuantity: { value: 75, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' } }] },
        ],
      },
      {
        linkId: 'about',
        item: [
          { linkId: 'born', answer: [{ valueDate: '1980-02' }] },
          { linkId: 'seen', answer: [{ valueDateTime: '2026-09-18T08:00:00-05:00' }] },
        ],
      },
      { linkId: 'colour', answer: [{ valueCoding: { system: 'http://example.org/colours', code: 'red', display: 'Red' } }] },
      { linkId: 'tags', answer: [{ valueInteger: 1 }, { valueInteger: 2 }] },
      { linkId: 'weight', answer: [{ valueDecimal: 70.5 }] },
    ]);
  });

  it('never carries a disabled node in any shape, retained answer or not (INV-E-01, INV-E-02, AC-05.2.2)', () => {
    const session = createSession(INTAKE);
    set(session, 'smoker', bool(true));
    set(session, 'amount', text('RETAINED-SENTINEL'));
    set(session, 'smoker', bool(false));
    const response = emit(session);
    expect(response.item).toEqual([{ linkId: 'smoker', text: 'Do you smoke?', answer: [{ valueBoolean: false }] }]);
    expect(JSON.stringify(response)).not.toContain('amount');
    expect(JSON.stringify(response)).not.toContain('SENTINEL');
  });

  it('writes repeat instances in position order, leaving out an instance with nothing answered', () => {
    const session = createSession(INTAKE);
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    set(session, 'meds[2]/name', text('third'));
    set(session, 'meds[0]/name', text('first'));
    session.dispatch({ type: 'RemoveRepeatInstance', path: itemPath('meds'), ordinal: 0 });
    session.dispatch({ type: 'AddRepeatInstance', path: itemPath('meds') });
    set(session, 'meds[3]/name', text('fourth'));
    const names = (emit(session).item as { item: { answer: { valueString: string }[] }[] }[]).map((group) => group.item[0]?.answer[0]?.valueString);
    expect(names).toEqual(['third', 'fourth']);
  });

  it('emits the host identity verbatim and invents none (AC-05.1.2, INV-S-32)', () => {
    const subject = { reference: 'Patient/1' };
    const identifier = { system: 'urn:x', value: 'r-1' };
    const withIdentity = createSession(INTAKE, { hostIdentity: { subject, identifier, author: { reference: 'Practitioner/2' } } });
    const response = emit(withIdentity);
    expect(Object.keys(response)).toEqual(['resourceType', 'identifier', 'questionnaire', 'status', 'subject', 'authored', 'author']);
    expect(response.subject).toBe(subject);
    expect(response.identifier).toBe(identifier);
    expect(Object.keys(emit(createSession(INTAKE)))).not.toContain('subject');
  });

  it('writes the status the session has, completed only after completion (INV-E-05, AC-05.1.3)', () => {
    const session = createSession(INTAKE);
    expect(emit(session).status).toBe('in-progress');
    session.dispatch({ type: 'RequestCompletion' });
    expect(emit(session).status).toBe('completed');
  });

  it('leaves out `questionnaire` for a questionnaire without a url, and the version when it has none (M3 plan D6)', () => {
    expect(emit(createSession(questionnaire([{ linkId: 'q', type: 'string' }])))).not.toHaveProperty('questionnaire');
    expect(emit(createSession({ ...INTAKE, version: undefined } as unknown as Questionnaire)).questionnaire).toBe('http://example.org/Questionnaire/intake');
  });

  it('never emits an unsupported placeholder (INV-E-04)', () => {
    const lenient = createSession(questionnaire([{ linkId: 'file', type: 'attachment' }, { linkId: 'q', type: 'string' }]), { loadMode: 'lenient' });
    set(lenient, 'q', text('x'));
    expect(emit(lenient).item).toEqual([{ linkId: 'q', answer: [{ valueString: 'x' }] }]);
  });

  it('builds the items once per cycle and shares them, frozen', () => {
    const session = createSession(INTAKE);
    set(session, 'smoker', bool(true));
    const first = emit(session);
    const second = emitResponse(session, { authored: '2027' });
    expect(second.item).toBe(first.item);
    expect(second.authored).toBe('2027');
    expect(Object.isFrozen(first.item?.[0])).toBe(true);
    set(session, 'smoker', bool(false));
    expect(emit(session).item).not.toBe(first.item);
  });

  it('stamps authored with the current instant when the caller gives none', () => {
    const before = Date.now();
    const authored = emitResponse(createSession(INTAKE)).authored ?? '';
    expect(Date.parse(authored)).toBeGreaterThanOrEqual(before - 1);
    expect(authored).toMatch(/Z$/);
  });

  it('throws only integration errors: an unknown session, an authored that is not a dateTime', () => {
    expect(() => emitResponse({} as Session)).toThrow(new FhirqError('unknown-session'));
    expect(() => emitResponse(createSession(INTAKE), { authored: 'yesterday' })).toThrow(new FhirqError('invalid-options'));
    expect(() => emitResponse(createSession(INTAKE), null as unknown as object)).toThrow(new FhirqError('invalid-options'));
  });
});
