import { describe, expect, it } from 'vitest';

import { createSession, emitResponse, itemPath } from '../../src/index.js';
import { snapshot } from '../../src/resume.js';
import { createView } from '../../src/view/index.js';
import { find } from './helpers.js';
import { SLICE } from '../slice.js';

describe('presentation holds no domain state (AC-3, INV-P-01)', () => {
  it('leaves answers, enablement and surfacing untouched when another view, locale or prefix is put over the session', () => {
    const session = createSession(SLICE);
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
    session.dispatch({ type: 'NoteItemLeft', path: itemPath('amount') });
    const state = session.getSnapshot();
    const stored = JSON.stringify(snapshot(session));
    const response = emitResponse(session, { authored: '2026-01-01T00:00:00Z' });

    // Tier and theme are renderer choices over one view model; a new view is what a switch costs the session at most.
    const views = [
      createView(session, { idPrefix: 'a', locale: 'en' }),
      createView(session, { idPrefix: 'b', locale: 'de', timeZone: 'Europe/Berlin', messages: { yes: 'Ja' } }),
      createView(session, { idPrefix: 'c', locale: 'ar' }),
    ];
    const models = views.map((view) => view.getSnapshot());

    expect(session.getSnapshot()).toBe(state);
    expect(JSON.stringify(snapshot(session))).toBe(stored);
    expect(emitResponse(session, { authored: '2026-01-01T00:00:00Z' })).toEqual(response);
    for (const model of models) {
      expect(model.nodes.map((node) => node.path)).toEqual(['smoker', 'amount']);
      expect(find(model, 'amount', 'short-text').invalid).toBe(true);
    }
    const [, german] = models;
    expect(german === undefined ? null : find(german, 'smoker', 'yes-no').options[0]?.label).toBe('Ja');
  });

  it('keeps the views in step: a command through one shows in all', () => {
    const session = createSession(SLICE);
    const first = createView(session, { idPrefix: 'a', locale: 'en' });
    const second = createView(session, { idPrefix: 'b', locale: 'en' });
    find(first.getSnapshot(), 'smoker', 'yes-no').set('true');
    expect(second.getSnapshot().nodes.map((node) => node.path)).toEqual(['smoker', 'amount']);
  });

  it('forwards the session’s notifications to the view’s subscribers, and stops when told', () => {
    const session = createSession(SLICE);
    const view = createView(session, { idPrefix: 'a', locale: 'en' });
    let calls = 0;
    const unsubscribe = view.subscribe(() => (calls += 1));
    find(view.getSnapshot(), 'smoker', 'yes-no').set('true');
    unsubscribe();
    find(view.getSnapshot(), 'smoker', 'yes-no').set('false');
    expect(calls).toBe(1);
  });
});
