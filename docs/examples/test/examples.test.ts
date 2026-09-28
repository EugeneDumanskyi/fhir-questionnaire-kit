import { itemPath } from '@fhirq/core';
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
