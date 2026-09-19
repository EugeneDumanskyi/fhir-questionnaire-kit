import { describe, expect, it } from 'vitest';

import { createSession, emitResponse, itemPath, type Answer, type OptionResolver, type QuestionnaireResponse, type Session } from '../../src/index.js';
import { hydrateSession, restoreSession, snapshot } from '../../src/resume.js';
import { questionnaire } from '../slice.js';

/**
 * T8 (AC-07.1.4): a resumed coded answer is loaded and never invalidated
 * because its options are pending, failed or unknown; and option sets are not
 * resume state: a restored session resolves them again (ADR-0005).
 */

const VS = 'http://example.org/ValueSet/drug';
const FORM = { ...questionnaire([{ linkId: 'drug', type: 'choice', answerValueSet: VS, required: true }]), url: 'http://example.org/Questionnaire/t8' };
const CODED: readonly Answer[] = [{ kind: 'coding', value: { system: 'urn:drugs', code: 'x1' } }];
const STORED: QuestionnaireResponse = {
  resourceType: 'QuestionnaireResponse',
  status: 'completed',
  questionnaire: FORM.url,
  item: [{ linkId: 'drug', answer: [{ valueCoding: { system: 'urn:drugs', code: 'x1' } }] }],
};

const pending: OptionResolver = () => new Promise(() => undefined);
const failing: OptionResolver = () => Promise.reject(new Error('down'));
const flush = () => new Promise<void>((resolve) => void Promise.resolve().then(() => resolve()));

const drug = (session: Session) => session.getSnapshot().nodes.find((node) => node.path === 'drug');

describe('resumed coded answers and option sets (T8, AC-07.1.4, ADR-0005)', () => {
  it.each([
    ['pending', { resolver: pending }],
    ['failed', { resolver: failing }],
    ['absent', {}],
  ] as const)('hydrates a coded answer while its options are %s, and raises no issue', async (_, options) => {
    const session = hydrateSession(FORM, STORED, options);
    await flush();
    expect(drug(session)?.answers).toEqual(CODED);
    expect(session.getSnapshot().issues).toEqual([]);
    expect(session.diagnostics.map((finding) => finding.code).filter((code) => code === 'quarantined-answer')).toEqual([]);
    expect(emitResponse(session).item).toEqual(STORED.item);
    expect(session.dispatch({ type: 'RequestCompletion' })).toEqual({ outcome: 'applied' });
  });

  it('restores a coded answer while its options are pending or failed, and resolves every set again', async () => {
    const calls: string[] = [];
    const resolver: OptionResolver = (valueSet) => {
      calls.push(valueSet);
      return Promise.resolve([{ system: 'urn:drugs', code: 'x1' }]);
    };
    const original = createSession(FORM, { resolver });
    await flush();
    expect(original.dispatch({ type: 'SetAnswer', path: itemPath('drug'), answers: CODED })).toEqual({ outcome: 'applied' });
    const saved = snapshot(original);
    expect(JSON.stringify(saved)).not.toContain('optionSets');
    expect(Object.keys(saved)).not.toContain('scores');

    for (const again of [pending, failing]) {
      const restored = restoreSession(FORM, saved, { resolver: again });
      await flush();
      expect(drug(restored)?.answers).toEqual(CODED);
      expect(restored.getSnapshot().issues).toEqual([]);
    }
    const restored = restoreSession(FORM, saved, { resolver });
    expect(calls).toEqual([VS, VS]);
    await flush();
    expect(restored.getSnapshot().optionSets[VS]?.status).toBe('resolved');
  });
});
