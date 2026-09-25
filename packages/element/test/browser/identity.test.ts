import { createSession, itemPath, type Answer, type Command, type Session } from '@fhirq/core';
import { createView, type View, type ViewModel } from '@fhirq/core/view';
import { defineQuestionnaireElement, type FhirQuestionnaireElement } from '@fhirq/element';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bool, questionnaire, text } from '../../../core/test/slice.js';

/**
 * M7 plan step 3a: M5's identity test (packages/core/test/view/identity.test.ts)
 * carried through to the DOM. Over a scripted sequence of commands, a node the
 * view kept causes no mutation in its subtree and is neither inserted nor
 * removed; the same holds for the error summary and the status while the
 * view keeps them. A MutationObserver on the shadow root sees every write.
 *
 * Which nodes the view kept is read from a second view over the same session:
 * the commands reach the session directly, so neither view holds a draft, and
 * both keep the same nodes.
 */

const when = (question: string, answer: boolean) => [{ question, operator: '=' as const, answerBoolean: answer }];

const FORM = questionnaire([
  { linkId: 'smoker', type: 'boolean', text: 'Do you smoke?' },
  { linkId: 'amount', type: 'string', text: 'How much do you smoke per day?', required: true, enableWhen: when('smoker', true) },
  { linkId: 'since', type: 'string', text: 'Since when?' },
  { linkId: 'reason', type: 'string', text: 'Why did you stop?', enableWhen: when('smoker', false) },
  { linkId: 'contact', type: 'boolean', text: 'May we contact you?', required: true },
]);

const answer = (linkId: string, answers: readonly Answer[]): Command => ({ type: 'SetAnswer', path: itemPath(linkId), answers });

describe('the element writes nothing into what the view kept (M7 plan step 3a)', () => {
  let session: Session;
  let element: FhirQuestionnaireElement;
  let shadow: ShadowRoot;
  let probe: View;
  let observer: MutationObserver;

  beforeEach(() => {
    defineQuestionnaireElement();
    session = createSession(FORM);
    element = document.createElement('fhir-questionnaire') as FhirQuestionnaireElement;
    element.session = session;
    document.body.append(element);
    shadow = element.shadowRoot as ShadowRoot;
    probe = createView(session, { idPrefix: 'probe', locale: 'en' });
    probe.getSnapshot();
    observer = new MutationObserver(() => undefined);
    observer.observe(shadow, { subtree: true, childList: true, attributes: true, characterData: true });
  });

  afterEach(() => {
    observer.disconnect();
    element.remove();
  });

  const itemRoot = (path: string) => shadow.querySelector(`[data-path="${path}"]`);

  /** The mutations inside `node`, or that inserted or removed it. */
  const touching = (mutations: readonly MutationRecord[], node: Node | null) =>
    node === null ? [] : mutations.filter((mutation) => node.contains(mutation.target) || [...mutation.addedNodes, ...mutation.removedNodes].includes(node));

  /** Top-level paths present before and after as the same object. */
  const kept = (before: ViewModel, after: ViewModel) => after.nodes.filter((node) => before.nodes.includes(node)).map((node) => node.path);

  /**
   * Sends a command, then checks every node, and the summary and the status,
   * that the view kept: no mutation reached any of them. Returns what the
   * view kept and the mutations, for the step's own expectations.
   */
  function step(command: Command) {
    const before = probe.getSnapshot();
    const summary = shadow.querySelector('.fhirq-summary');
    session.dispatch(command);
    const after = probe.getSnapshot();
    const mutations = observer.takeRecords();

    const paths = kept(before, after);
    for (const path of paths) expect(touching(mutations, itemRoot(path)), path).toEqual([]);
    if (after.errorSummary !== null && after.errorSummary === before.errorSummary) expect(touching(mutations, summary)).toEqual([]);
    if (after.announcement === before.announcement) expect(touching(mutations, shadow.querySelector('.fhirq-status'))).toEqual([]);
    return { paths, mutations, keptSummary: after.errorSummary === before.errorSummary };
  }

  it('over answers, a leave, a refused completion and a branch hidden and shown', () => {
    // Answering the root question renews it and shows `amount`: the nodes after it are kept.
    let { paths, mutations, keptSummary } = step(answer('smoker', bool(true)));
    expect(paths).toEqual(['since', 'contact']);
    expect(itemRoot('amount')).not.toBeNull();

    // An answer to `since` renews it alone.
    ({ paths } = step(answer('since', text('2019'))));
    expect(paths).toEqual(['smoker', 'amount', 'contact']);

    // Leaving `amount` empty surfaces its issue: it is written to, nothing else is.
    ({ paths, mutations } = step({ type: 'NoteItemLeft', path: itemPath('amount') }));
    expect(paths).toEqual(['smoker', 'since', 'contact']);
    expect(touching(mutations, itemRoot('amount')).length).toBeGreaterThan(0);

    // A refused completion surfaces `contact` and shows the summary; `amount` had surfaced already.
    ({ paths } = step({ type: 'RequestCompletion' }));
    expect(paths).toEqual(['smoker', 'amount', 'since']);
    expect(shadow.querySelectorAll('.fhirq-summary-link')).toHaveLength(2);

    // Another answer renews `since`; the summary is the same object, so it is not touched.
    ({ paths, keptSummary } = step(answer('since', text('2018'))));
    expect(paths).toEqual(['smoker', 'amount', 'contact']);
    expect(keptSummary).toBe(true);

    // Hiding the branch drops `amount` and its summary entry, and shows `reason`.
    // `contact`'s entry is keyed by its link, so it keeps its node.
    const contactEntry = shadow.querySelectorAll('.fhirq-summary-entry')[1] ?? null;
    ({ paths, mutations } = step(answer('smoker', bool(false))));
    expect(paths).toEqual(['since', 'contact']);
    expect([itemRoot('amount'), itemRoot('reason')?.previousElementSibling]).toEqual([null, itemRoot('since')]);
    expect([...shadow.querySelectorAll('.fhirq-summary-entry')]).toEqual([contactEntry]);
    expect(touching(mutations, contactEntry)).toEqual([]);

    // Answering `contact` clears the last issue: the summary goes, and the rest are kept.
    ({ paths } = step(answer('contact', bool(true))));
    expect(paths).toEqual(['smoker', 'since', 'reason']);
    expect(shadow.querySelector('.fhirq-summary')).toBeNull();
  });
});
