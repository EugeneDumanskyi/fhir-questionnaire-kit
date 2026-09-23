import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createSession, type Questionnaire } from '../../src/index.js';
import { createView } from '../../src/view/index.js';
import { find, flatten } from './helpers.js';

/**
 * ADR-0007's verification and M5 AC-1: the demo fixture driven through a
 * refused completion by the view model alone, in Node, with no renderer. The
 * respondent answers a few questions, types a date that is not one, adds a
 * medicine and then asks to finish.
 */
const demo = JSON.parse(readFileSync(new URL('../../../../fixtures/demo/questionnaire.json', import.meta.url), 'utf8')) as Questionnaire;

describe('the demo, through a refused completion, Node only (M5 AC-1)', () => {
  it('orders the summary as the issues are ordered, targets the summary and announces the refusal', () => {
    const session = createSession(demo);
    const view = createView(session, { idPrefix: 'demo', locale: 'en-GB', timeZone: 'Europe/London' });
    const model = () => view.getSnapshot();
    model();

    find(model(), 'visit/visit-date', 'calendar-date').set('next Tuesday');
    find(model(), 'pain/pain-now', 'yes-no').set('true');
    expect(model().announcement?.text).toBe('1 question shown.');
    find(model(), 'pain/pain-score', 'integer').set('7');
    find(model(), 'medicine', 'repeating-group').add();
    expect(model().focusTarget?.id).toBe('demo-medicine_5b_1_5d__2f_medicine-name-control');
    find(model(), 'medicine[1]/medicine-name', 'short-text').set('Paracetamol');

    find(model(), 'visit/visit-date', 'calendar-date').leave();
    expect(model().announcement?.text).toBe('1 answer needs attention.');

    session.dispatch({ type: 'RequestCompletion' });
    const refused = model();

    expect(refused.errorSummary).toEqual({
      id: 'demo-summary',
      headingId: 'demo-summary-heading',
      heading: 'There is a problem',
      entries: [
        { path: 'visit/visit-date', message: 'Date of your appointment: Answer this question', focusId: 'demo-visit_2f_visit-date-control' },
        { path: 'visit/visit-date', message: 'Date of your appointment: Enter a real date, like 2024-05-01, 2024-05 or 2024', focusId: 'demo-visit_2f_visit-date-control' },
        { path: 'visit/visit-reason', message: 'What is the main reason for your visit?: Answer this question', focusId: 'demo-visit_2f_visit-reason-control' },
      ],
    });
    // The engine's issues come in `SessionState.issues` order (INV-V-06); the summary keeps it.
    const engineOrder = session.getSnapshot().issues.map((issue) => issue.path);
    const summaryOrder = refused.errorSummary?.entries.map((entry) => entry.path).filter((path, i, all) => all.indexOf(path) === i);
    expect(summaryOrder).toEqual(engineOrder.filter((path, i, all) => all.indexOf(path) === i));
    expect(refused.focusTarget).toEqual({ id: 'demo-summary', cycle: session.getSnapshot().cycle });
    expect(refused.announcement?.text).toBe('The form was not completed. 3 answers need attention.');
    // Every summary link lands on a control the view describes.
    const controls = new Set(flatten(refused.nodes).map((node) => node.ids.control));
    for (const entry of refused.errorSummary?.entries ?? []) expect(controls.has(entry.focusId ?? '')).toBe(true);

    // Fixing the issues empties the summary; the next completion is announced.
    find(model(), 'visit/visit-date', 'calendar-date').set('2026-10-01');
    find(model(), 'visit/visit-reason', 'long-text').set('Check-up');
    expect(model().errorSummary).toBeNull();
    session.dispatch({ type: 'RequestCompletion' });
    expect(model()).toMatchObject({ completed: true, announcement: { text: 'The form is complete.' } });
  });

  it('renders every node of the demo with a control kind and no placeholder', () => {
    const view = createView(createSession(demo), { idPrefix: 'demo', locale: 'en' });
    const kinds = new Set(flatten(view.getSnapshot().nodes).map((node) => node.control));
    expect(kinds.has('unsupported')).toBe(false);
    expect([...kinds].sort()).toEqual(['group', 'long-text', 'calendar-date', 'decimal', 'quantity', 'repeating-group', 'short-text', 'single-choice', 'statement', 'yes-no'].sort());
  });
});
