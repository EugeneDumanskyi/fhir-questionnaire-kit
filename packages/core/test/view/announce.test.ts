import { describe, expect, it } from 'vitest';

import { itemPath } from '../../src/index.js';
import { createView } from '../../src/view/index.js';
import { setup } from './helpers.js';

const gated = (linkId: string, extra: object = {}) => ({ linkId, type: 'string' as const, text: linkId, enableWhen: [{ question: 'smoker', operator: '=' as const, answerBoolean: true }], ...extra });

describe('announcements (INV-P-03, AC-11.3.2, NFR-A-08)', () => {
  it('names what changed and how many, in one message per cycle', () => {
    const { at, model } = setup([
      { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
      gated('amount'),
      { linkId: 'box', type: 'group', text: 'Box', enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }], item: [{ linkId: 'since', type: 'string', text: 'Since' }] },
    ]);
    at('smoker', 'yes-no').set('true');
    // A group appearing is not a question; the two questions are.
    expect(model().announcement).toEqual({ text: '2 questions shown.', cycle: 1 });
    at('smoker', 'yes-no').set('false');
    expect(model().announcement?.text).toBe('2 questions hidden.');
    at('smoker', 'yes-no').set('true');
    at('amount', 'short-text').set('10');
    expect(model().announcement).toBeNull();
  });

  it('joins everything one cycle did into one message', () => {
    const { session, model } = setup([
      { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
      gated('amount', { required: true }),
      { linkId: 'other', type: 'string', text: 'Other', required: true },
    ]);
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
    session.dispatch({ type: 'RequestCompletion' });
    expect(model().announcement?.text).toBe('The form was not completed. 2 answers need attention.');
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: false }] });
    expect(model().announcement?.text).toBe('1 question hidden.');
  });

  it('announces issues surfaced by leaving, the view’s own among them, each path once', () => {
    const { at, model } = setup([{ linkId: 'n', type: 'integer', text: 'N', required: true }]);
    at('n', 'integer').set('x');
    at('n', 'integer').leave();
    expect(model().announcement?.text).toBe('1 answer needs attention.');
    at('n', 'integer').leave();
    expect(model().announcement?.text).toBe('1 answer needs attention.');
  });

  it('keeps the announcement object across a view-only change that has nothing to say, so it is not repeated', () => {
    const { at, model } = setup([{ linkId: 'smoker', type: 'boolean', text: 'Smoker' }, gated('d', { type: 'date' })]);
    at('smoker', 'yes-no').set('true');
    const shown = model().announcement;
    at('d', 'calendar-date').set('20');
    expect(model().announcement).toBe(shown);
  });

  it('announces options arriving, or failing, as a change of their own (T12)', async () => {
    const plans: Record<string, Promise<readonly { code: string }[]>> = { 'urn:a': Promise.resolve([{ code: 'x' }]), 'urn:b': Promise.reject(new Error('down')) };
    const { view } = setup(
      [
        { linkId: 'a1', type: 'choice', text: 'A1', answerValueSet: 'urn:a' },
        { linkId: 'a2', type: 'choice', text: 'A2', answerValueSet: 'urn:a' },
        { linkId: 'b', type: 'choice', text: 'B', answerValueSet: 'urn:b' },
      ],
      {},
      { resolver: (valueSet) => plans[valueSet] ?? Promise.resolve([]) },
    );
    // Read on each notification, as a renderer does: each settlement is its own cycle.
    const heard: (string | undefined)[] = [];
    view.getSnapshot();
    view.subscribe(() => heard.push(view.getSnapshot().announcement?.text));
    for (let tick = 0; tick < 4; tick += 1) await Promise.resolve();
    expect(heard).toEqual(['Choices loaded for 2 questions.', 'Choices could not be loaded for 1 question.']);
  });

  it('says nothing when options settle for no visible question', async () => {
    const { model } = setup(
      [
        { linkId: 'smoker', type: 'boolean', text: 'Smoker' },
        { linkId: 'c', type: 'choice', text: 'C', answerValueSet: 'urn:a', enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
      ],
      {},
      { resolver: () => Promise.resolve([{ code: 'x' }]) },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(model().announcement).toBeNull();
  });

  it('announces nothing and moves no focus on its first model, even over a session that has had cycles', () => {
    const { session, view } = setup([{ linkId: 'a', type: 'string', text: 'A', required: true }]);
    session.dispatch({ type: 'RequestCompletion' });
    const late = createView(session, { idPrefix: 'late', locale: 'en' }).getSnapshot();
    expect(late).toMatchObject({ announcement: null, focusTarget: null, errorSummary: { id: 'late-summary' } });
    // The view that was there sees the cycle and says so.
    expect(view.getSnapshot()).toMatchObject({ announcement: { text: 'The form was not completed. 1 answer needs attention.' }, focusTarget: { id: 'fq-summary' } });
  });

  it('announces a completion', () => {
    const { session, model } = setup([{ linkId: 'a', type: 'string', text: 'A' }]);
    session.dispatch({ type: 'RequestCompletion' });
    expect(model()).toMatchObject({ completed: true, announcement: { text: 'The form is complete.' }, errorSummary: null });
  });
});
