import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createSession, itemPath, type Questionnaire } from '../src/index.js';
import { createView, type ShortTextViewNode, type ViewModel, type YesNoViewNode } from '../src/view/index.js';
import { fill, plural } from '../src/view/format.js';
import { nodeIds, pathId } from '../src/view/ids.js';
import { questionnaire, SLICE } from './slice.js';

const setup = (input: Questionnaire = SLICE) => {
  const session = createSession(input);
  const view = createView(session, { idPrefix: 'fq' });
  return { session, view };
};
const yesNo = (model: ViewModel, index = 0) => model.nodes[index] as YesNoViewNode;
const text = (model: ViewModel, index = 1) => model.nodes[index] as ShortTextViewNode;

describe('view nodes', () => {
  it('describes the initial form without markup', () => {
    const { view } = setup();
    const model = view.getSnapshot();

    expect(model).toMatchObject({ completed: false, requiredMarker: '*', announcement: null, errorSummary: null, focusTarget: null });
    expect(model.nodes).toHaveLength(1);
    expect(yesNo(model)).toMatchObject({
      path: 'smoker',
      control: 'yes-no',
      label: 'Do you smoke?',
      description: null,
      required: false,
      invalid: false,
      issues: [],
      value: null,
      choices: [
        { value: true, label: 'Yes', selected: false },
        { value: false, label: 'No', selected: false },
      ],
      ids: { control: 'fq-smoker-control', label: 'fq-smoker-label', description: 'fq-smoker-description', error: 'fq-smoker-error' },
    });
  });

  it('renders only the two control kinds M1 built; other types wait for M5 (M2 plan D9)', () => {
    const { view } = setup(
      questionnaire([
        ...SLICE.item,
        { linkId: 'age', type: 'integer', text: 'Age' },
        { linkId: 'g', type: 'group', item: [{ linkId: 'inner', type: 'string', text: 'Inner' }] },
      ]),
    );
    expect(view.getSnapshot().nodes.map((node) => node.path)).toEqual(['smoker', 'g/inner']);
  });

  it('returns the same model until the session changes', () => {
    const { view } = setup();
    const first = view.getSnapshot();
    expect(view.getSnapshot()).toBe(first);
    yesNo(first).leave();
    expect(view.getSnapshot()).toBe(first);
  });

  it('binds commands that drive the session, and keeps unchanged nodes by identity (ADR-0007)', () => {
    const { view } = setup();
    yesNo(view.getSnapshot()).set(true);
    const shown = view.getSnapshot();
    expect(yesNo(shown)).toMatchObject({ value: true, choices: [{ selected: true }, { selected: false }] });
    expect(text(shown)).toMatchObject({ control: 'short-text', value: '', required: true, invalid: false });

    text(shown).set('10');
    const typed = view.getSnapshot();
    expect(typed.nodes[0]).toBe(shown.nodes[0]);
    expect(typed.nodes[1]).not.toBe(shown.nodes[1]);
    expect(text(typed).value).toBe('10');
  });

  it('keeps the node array itself when no node changed', () => {
    const { session, view } = setup();
    yesNo(view.getSnapshot()).set(true);
    const before = view.getSnapshot();
    session.dispatch({ type: 'RequestCompletion' });
    session.dispatch({ type: 'RequestCompletion' });
    const after = view.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.nodes[0]).toBe(before.nodes[0]);
  });

  it('clears the answer when the text is emptied, since FHIR has no empty string', () => {
    const { view } = setup();
    yesNo(view.getSnapshot()).set(true);
    text(view.getSnapshot()).set('10');
    text(view.getSnapshot()).set('');
    expect(text(view.getSnapshot()).value).toBe('');
    text(view.getSnapshot()).leave();
    expect(text(view.getSnapshot()).invalid).toBe(true);
  });

  it('clears a yes-no answer back to unanswered', () => {
    const { view } = setup();
    yesNo(view.getSnapshot()).set(false);
    yesNo(view.getSnapshot()).clear();
    expect(yesNo(view.getSnapshot()).value).toBeNull();
  });

  it('shows issues only once surfaced, with a message from the catalogue (SM-03)', () => {
    const { view } = setup();
    yesNo(view.getSnapshot()).set(true);
    text(view.getSnapshot()).leave();

    const model = view.getSnapshot();
    expect(text(model)).toMatchObject({ invalid: true, issues: [{ rule: 'required', message: 'Answer this question' }] });
    expect(model.announcement).toEqual({ text: '1 answer needs attention.', cycle: 2 });
    expect(model.errorSummary).toBeNull();
  });
});

describe('announcements, error summary and focus target (ADR-0007 verification, Node only)', () => {
  it('announces what changed and how many, once per cycle (INV-P-03)', () => {
    const { view } = setup(
      questionnaire([
        ...SLICE.item,
        { linkId: 'since', type: 'string', text: 'Since when?', enableWhen: [{ question: 'smoker', operator: '=', answerBoolean: true }] },
      ]),
    );
    yesNo(view.getSnapshot()).set(true);
    expect(view.getSnapshot().announcement?.text).toBe('2 questions shown.');
    yesNo(view.getSnapshot()).set(false);
    expect(view.getSnapshot().announcement?.text).toBe('2 questions hidden.');
    yesNo(view.getSnapshot()).set(true);
    text(view.getSnapshot()).set('10');
    expect(view.getSnapshot().announcement).toBeNull();
  });

  it('after a refused completion, summarises in document order and targets the summary', () => {
    const { session, view } = setup();
    yesNo(view.getSnapshot()).set(true);
    session.dispatch({ type: 'RequestCompletion' });

    const model = view.getSnapshot();
    expect(model.errorSummary).toEqual({
      id: 'fq-summary',
      headingId: 'fq-summary-heading',
      heading: 'There is a problem',
      entries: [{ path: 'amount', message: 'Answer this question: How much do you smoke per day?', focusId: 'fq-amount-control' }],
    });
    expect(model.focusTarget).toEqual({ id: 'fq-summary', cycle: 2 });
    expect(model.announcement?.text).toBe('The form was not completed. 1 answer needs attention.');

    session.dispatch({ type: 'RequestCompletion' });
    const again = view.getSnapshot();
    expect(again.focusTarget).toEqual({ id: 'fq-summary', cycle: 3 });
    expect(again.errorSummary).toBe(model.errorSummary);
  });

  it('drops the summary once nothing is surfaced, and announces completion', () => {
    const { session, view } = setup();
    yesNo(view.getSnapshot()).set(true);
    session.dispatch({ type: 'RequestCompletion' });
    text(view.getSnapshot()).set('10');
    expect(view.getSnapshot()).toMatchObject({ errorSummary: null, focusTarget: null });

    session.dispatch({ type: 'RequestCompletion' });
    expect(view.getSnapshot()).toMatchObject({ completed: true, errorSummary: null, announcement: { text: 'The form is complete.' } });
  });

  it('forwards session notifications to view subscribers', () => {
    const { view } = setup();
    const listener = vi.fn();
    const unsubscribe = view.subscribe(listener);
    yesNo(view.getSnapshot()).set(true);
    unsubscribe();
    yesNo(view.getSnapshot()).set(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith();
  });
});

describe('message formatting (NFR-I-04)', () => {
  it('fills placeholders literally, even when a value looks like a replacement pattern', () => {
    expect(fill('{message}: {label}', { message: 'M', label: "$& $1 costs $'" })).toBe("M: $& $1 costs $'");
    expect(fill('{unknown}', {})).toBe('{unknown}');
  });

  it('formats counts through Intl', () => {
    expect(plural({ one: '{count} item', other: '{count} items' }, 1200)).toBe('1,200 items');
  });
});

describe('path-derived ids (INV-P-02)', () => {
  it('escapes a path into one id token and never maps two paths to one id', () => {
    expect(pathId('a b')).toBe('a_20_b');
    expect(pathId('a_20_b')).toBe('a_5f_20_5f_b');
    expect(pathId('1.2-x')).toBe('1.2-x');
    const ids = ['a', 'a-control', 'summary', 'summary-heading'].flatMap((path) => {
      const { control, label, description, error } = nodeIds('p', path);
      return [control, label, description, error];
    });
    expect(new Set([...ids, 'p-summary', 'p-summary-heading']).size).toBe(ids.length + 2);
  });
});

describe('the message catalogue (US-07.4, INV-X-08, ADR-0020)', () => {
  const refuse = (overrides: Parameters<typeof createView>[1]['messages'], rules?: Parameters<typeof createSession>[1]) => {
    const session = createSession(SLICE, rules);
    const view = createView(session, { idPrefix: 'fq', ...(overrides === undefined ? {} : { messages: overrides }) });
    session.dispatch({ type: 'SetAnswer', path: itemPath('smoker'), answers: [{ kind: 'boolean', value: true }] });
    session.dispatch({ type: 'RequestCompletion' });
    return view.getSnapshot();
  };

  it('uses a supplied key and falls back to the built-in text for the rest, key by key', () => {
    const model = refuse({ yes: 'Ja', errorSummaryHeading: 'Es gibt ein Problem', announceRefused: { one: 'Nicht fertig: {count}.', other: 'Nicht fertig: {count}.' } });
    expect(yesNo(model).choices.map((choice) => choice.label)).toEqual(['Ja', 'No']);
    expect(model.errorSummary?.heading).toBe('Es gibt ein Problem');
    expect(model.announcement?.text).toBe('Nicht fertig: 1.');
    expect(text(model).issues[0]?.message).toBe('Answer this question');
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['not a string', 42],
    ['a plural message where a string belongs', { one: 'x', other: 'y' }],
  ])('falls back when a supplied string is %s, never to an empty or raw-key string', (_, given) => {
    const model = refuse({ yes: given, issueRequired: given } as unknown as Parameters<typeof createView>[1]['messages']);
    expect(yesNo(model).choices[0]?.label).toBe('Yes');
    expect(text(model).issues[0]?.message).toBe('Answer this question');
  });

  it('falls back when a plural message is missing a form', () => {
    const model = refuse({ announceRefused: { one: 'only one' } } as unknown as Parameters<typeof createView>[1]['messages']);
    expect(model.announcement?.text).toBe('The form was not completed. 1 answer needs attention.');
  });

  it('never reads an inherited name as a key', () => {
    const model = refuse(Object.create({ yes: 'inherited' }) as Parameters<typeof createView>[1]['messages']);
    expect(yesNo(model).choices[0]?.label).toBe('Yes');
  });

  it("gives a rule's issue the host's text for its key, else the generic message, never the key (AC-7)", () => {
    const rules = { rules: [{ inputs: ['smoker'], targets: ['amount'], check: () => 'smoker-amount' }] };
    expect(text(refuse({ 'smoker-amount': 'Say how much you smoke' }, rules)).issues.map((issue) => issue.message)).toEqual([
      'Answer this question',
      'Say how much you smoke',
    ]);
    const fallback = text(refuse(undefined, rules)).issues.map((issue) => issue.message);
    expect(fallback).toEqual(['Answer this question', 'Check this answer']);
    expect(fallback).not.toContain('smoker-amount');
  });

  it('holds at most 45 keys, each with its context documented (NFR-I-02)', async () => {
    const { en } = await import('../src/view/messages/en.js');
    const source = readFileSync(new URL('../src/view/messages/en.ts', import.meta.url), 'utf8');
    expect(Object.keys(en).length).toBeLessThanOrEqual(45);
    for (const key of Object.keys(en)) expect(source, key).toMatch(new RegExp(`\\*/\\n  ${key}:`));
  });
});
