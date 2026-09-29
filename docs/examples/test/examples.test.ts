import type { QuestionnaireResponse } from '@fhirq/core';
import { itemPath } from '@fhirq/core';
import type { FhirQuestionnaireElement } from '@fhirq/element';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

/**
 * NFR-Q-08 (M10 AC-3): every example the docs show runs, and does what the
 * prose beside it says. `scripts/docs-snippets.mjs --check` holds the docs to
 * these sources; this holds the sources to the behaviour.
 */

const answers = (state: { readonly nodes: readonly { readonly path: string; readonly answers: readonly unknown[] }[] }, path: string) =>
  state.nodes.find((node) => node.path === path)?.answers;

describe('the 07-api.md examples (NFR-Q-08)', () => {
  it('§3.1: creates a session, hears the change and holds the answer', async () => {
    const { rendered, session } = await import('../src/session.js');

    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toBe(session.getSnapshot());
    expect(answers(session.getSnapshot(), 'smoker')).toEqual([{ kind: 'boolean', value: true }]);
    expect(session.diagnostics).toEqual([]);
  });

  it('§3.7: a cross-field rule raises its key while systolic is not above diastolic', async () => {
    const { session } = await import('../src/rules.js');
    const set = (linkId: string, value: number) =>
      session.dispatch({ type: 'SetAnswer', path: itemPath(linkId), answers: [{ kind: 'integer', value }] });

    set('systolic', 80);
    set('diastolic', 90);
    expect(session.getSnapshot().issues.map((issue) => [issue.code, issue.message, issue.linkId])).toEqual([
      ['rule', 'bp-order', 'systolic'],
      ['rule', 'bp-order', 'diastolic'],
    ]);
    set('systolic', 120);
    expect(session.getSnapshot().issues).toEqual([]);
  });

  it('§3.8: emits the response, stamped with the given authored', async () => {
    const { response } = await import('../src/emission.js');

    expect(response).toMatchObject({
      resourceType: 'QuestionnaireResponse',
      questionnaire: 'urn:fhirq:docs:smoking|1',
      status: 'in-progress',
      authored: '2026-09-18T10:00:00+02:00',
      item: [{ linkId: 'smoker', answer: [{ valueBoolean: false }] }],
    });
  });

  it('§3.9: resolves, scores, calculates and sanitizes through the host collaborators', async () => {
    const { reported, session } = await import('../src/collaborators.js');
    await Promise.resolve();
    await Promise.resolve();
    const choose = (linkId: string, code: string) =>
      session.dispatch({ type: 'SetAnswer', path: itemPath(linkId), answers: [{ kind: 'coding', value: { system: 'urn:fhirq:docs:frequency', code } }] });

    choose('q1', '2');
    choose('q2', '3');
    const state = session.getSnapshot();

    expect(state.scores).toEqual({ total: 5 });
    expect(answers(state, 'total')).toEqual([{ kind: 'integer', value: 2 }]);
    expect(state.nodes.find((node) => node.path === 'q1')?.item.xhtml).toBe('<b>Little</b> interest or pleasure in doing things');
    expect(session.diagnostics).toEqual([]);
    expect(reported).toEqual([]);
  });

  it('§4: restores the hidden answer from a snapshot, and hydrates only what was emitted', async () => {
    const { hydrated, restored } = await import('../src/resume.js');

    expect(answers(hydrated.getSnapshot(), 'smoker')).toEqual([{ kind: 'boolean', value: false }]);
    for (const session of [restored, hydrated]) {
      session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
    }

    expect(answers(restored.getSnapshot(), 'per-day')).toEqual([{ kind: 'integer', value: 5 }]);
    expect(answers(hydrated.getSnapshot(), 'per-day')).toEqual([]);
  });

  it('§5: builds a view model whose ids carry the prefix', async () => {
    const { model } = await import('../src/view.js');

    expect(model.nodes.map((node) => node.path)).toEqual(['smoker']);
    expect(JSON.stringify(model)).toMatch(/"intake-/);
  });
});

describe("the examples' READMEs (NFR-Q-08)", () => {
  it('themed-host: the React imports resolve and load, in the order shown', async () => {
    // Not a literal, so this project's typecheck does not pull in another's file; `examples/themed-host` typechecks it.
    const imports = new URL('../../../examples/themed-host/react.ts', import.meta.url).href;

    await expect(import(imports)).resolves.toBeDefined();
  });
});

describe("the guides' examples (NFR-Q-08)", () => {
  it('scoring: reads each option\'s score from ordinalValue, and scores only once every item is answered', async () => {
    const { session, table } = await import('../src/scoring.js');
    const choose = (linkId: string, code: string) =>
      session.dispatch({ type: 'SetAnswer', path: itemPath('wellbeing', linkId), answers: [{ kind: 'coding', value: { code } }] });

    const scale = new Map([['never', 0], ['some-days', 1], ['most-days', 2], ['every-day', 3]]);
    expect(table).toEqual(new Map([['wellbeing-energy', scale], ['wellbeing-sleep', scale]]));
    expect(session.getSnapshot().scores).toEqual({ wellbeing: null });
    choose('wellbeing-energy', 'most-days');
    expect(session.getSnapshot().scores).toEqual({ wellbeing: null });
    choose('wellbeing-sleep', 'some-days');
    expect(session.getSnapshot().scores).toEqual({ wellbeing: 3 });
    expect(session.diagnostics).toEqual([]);
  });

  it('retention: a hidden answer is emitted by neither policy, and only retain-exclude brings it back', async () => {
    const { erased, kept, responses } = await import('../src/retention.js');

    for (const response of responses) expect(response.item).toEqual([{ linkId: 'smoker', text: 'Do you smoke?', answer: [{ valueBoolean: false }] }]);
    expect(answers(kept.getSnapshot(), 'per-day')).toEqual([{ kind: 'integer', value: 5 }]);
    expect(answers(erased.getSnapshot(), 'per-day')).toEqual([]);
  });

  it('save and resume: the saved snapshot restores the session, the hidden answer included', async () => {
    const { drafts, resumed } = await import('../src/storage.js');

    expect(drafts.size).toBe(1);
    expect(answers(resumed.getSnapshot(), 'smoker')).toEqual([{ kind: 'boolean', value: false }]);
    resumed.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
    expect(answers(resumed.getSnapshot(), 'per-day')).toEqual([{ kind: 'integer', value: 5 }]);
  });

  it('resolver: a failed set is retried on request, and its options then take an answer', async () => {
    const { calls, retry, session, VALUE_SET } = await import('../src/resolver.js');
    const settle = async () => {
      for (let turn = 0; turn < 3; turn += 1) await Promise.resolve();
    };

    await settle();
    expect(session.getSnapshot().optionSets[VALUE_SET]?.status).toBe('failed');
    expect(session.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['resolver-failed']);
    retry();
    await settle();
    expect(calls).toEqual([VALUE_SET, VALUE_SET]);
    expect(session.getSnapshot().optionSets[VALUE_SET]?.status).toBe('resolved');
    retry();
    expect(calls).toHaveLength(2);
    const result = session.dispatch({ type: 'SetAnswer', path: itemPath('contact'), answers: [{ kind: 'coding', value: { system: 'urn:fhirq:docs:contact', code: 'email' } }] });
    expect(result).toEqual({ outcome: 'applied' });
  });

  it('tier 4: a headless host draws the view model its own way', async () => {
    const { lines } = await import('../src/headless.js');

    expect(lines).toEqual(['Do you smoke? *']);
  });

  it('tier 3: the React form renders the host\'s switch in place of the yes/no radios, with the kit\'s label around it', async () => {
    const { Intake } = await import('../src/tier3.js');

    const html = renderToString(createElement(Intake));
    const id = /<input type="checkbox" role="switch" id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeDefined();
    expect(html).toContain(`for="${id ?? ''}"`);
    expect(html).not.toContain('type="radio"');
  });

  it('element: stores drafts and the stamped record, and completes from the host\'s button', async () => {
    const { wire } = await import('../src/element.js');
    const completions: number[] = [];
    const form = Object.assign(new EventTarget(), { requestCompletion: () => completions.push(1) });
    const submit = new EventTarget();
    const drafts: QuestionnaireResponse[] = [];
    const records: QuestionnaireResponse[] = [];
    const response: QuestionnaireResponse = { resourceType: 'QuestionnaireResponse', status: 'in-progress' };

    wire(form as unknown as FhirQuestionnaireElement, submit as unknown as HTMLButtonElement, { draft: (r) => drafts.push(r), record: (r) => records.push(r) });
    form.dispatchEvent(new CustomEvent('fhirq-change', { detail: response }));
    submit.dispatchEvent(new Event('click'));
    form.dispatchEvent(new CustomEvent('fhirq-complete', { detail: { ...response, status: 'completed' } }));

    expect(drafts).toEqual([response]);
    expect(completions).toHaveLength(1);
    expect(records).toEqual([{ ...response, status: 'completed', authored: expect.stringMatching(/Z$/) as unknown }]);
  });
});
