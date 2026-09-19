import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import {
  createSession,
  itemPath,
  type Answer,
  type Coding,
  type OptionResolver,
  type Questionnaire,
  type Session,
  type SessionChange,
} from '../../src/index.js';
import { bool, questionnaire, text } from '../slice.js';

const VS = 'http://example.org/ValueSet/substance';
const OTHER = 'http://example.org/ValueSet/route';

/** Two value sets, one of them only on a branch the respondent may never open (ADR-0005). */
const FORM: Questionnaire = questionnaire([
  { linkId: 'uses', type: 'boolean' },
  { linkId: 'substance', type: 'choice', answerValueSet: VS, enableWhen: [{ question: 'uses', operator: '=', answerBoolean: true }] },
  { linkId: 'route', type: 'open-choice', answerValueSet: OTHER },
  { linkId: 'again', type: 'choice', answerValueSet: VS },
  { linkId: 'note', type: 'string' },
]);

const CODES: readonly Coding[] = [{ system: 'urn:s', code: 'a', display: 'A' }, { code: 'b' }];
const coded = (code: string): readonly Answer[] => [{ kind: 'coding', value: { system: 'urn:s', code } }];
const set = (session: Session, path: string, answers: readonly Answer[]) => session.dispatch({ type: 'SetAnswer', path: itemPath(path), answers });
const statuses = (session: Session) => Object.fromEntries(Object.entries(session.getSnapshot().optionSets).map(([url, set]) => [url, set.status]));

/** A resolver whose calls the test settles by hand. */
function controlled() {
  const calls: { valueSet: string; signal: AbortSignal; resolve: (list: unknown) => void; reject: (error: unknown) => void }[] = [];
  const resolver: OptionResolver = (valueSet, { signal }) =>
    new Promise((resolve, reject) => {
      calls.push({ valueSet, signal, resolve: resolve as (list: unknown) => void, reject });
    });
  const call = (valueSet: string, index = 0) => {
    const found = calls.filter((entry) => entry.valueSet === valueSet)[index];
    if (found === undefined) throw new Error(`no call ${index} for ${valueSet}`);
    return found;
  };
  return { calls, resolver, call };
}

/** Lets promise callbacks run: a settlement is a cycle of its own, after the one that is running (T12). */
const flush = () => new Promise<void>((resolve) => void Promise.resolve().then(() => resolve()));

describe('option resolution (SM-04, ADR-0005, ADR-0012)', () => {
  it('calls the resolver once per distinct canonical, at start, whatever is enabled (INV-X-01, AC-07.1.1)', () => {
    const { calls, resolver } = controlled();
    const session = createSession(FORM, { resolver });
    expect(calls.map((entry) => entry.valueSet)).toEqual([VS, OTHER]);
    expect(statuses(session)).toEqual({ [VS]: 'pending', [OTHER]: 'pending' });
    set(session, 'uses', bool(true));
    set(session, 'uses', bool(false));
    expect(calls).toHaveLength(2);
  });

  it('keys a set by its canonical verbatim, so two versions are two sets (M4 plan D6)', () => {
    const { calls, resolver } = controlled();
    createSession(
      questionnaire([
        { linkId: 'a', type: 'choice', answerValueSet: `${VS}|1` },
        { linkId: 'b', type: 'choice', answerValueSet: `${VS}|2` },
      ]),
      { resolver },
    );
    expect(calls.map((entry) => entry.valueSet)).toEqual([`${VS}|1`, `${VS}|2`]);
  });

  it('refuses a coded answer while pending, takes open-choice text, and blocks nothing else (AC-07.1.1, INV-X-02)', () => {
    const { resolver } = controlled();
    const session = createSession(FORM, { resolver });
    expect(set(session, 'again', coded('a'))).toEqual({ outcome: 'refused', reason: 'options-unresolved' });
    expect(set(session, 'route', coded('a'))).toEqual({ outcome: 'refused', reason: 'options-unresolved' });
    expect(set(session, 'route', text('by mouth'))).toEqual({ outcome: 'applied' });
    expect(set(session, 'note', text('fine'))).toEqual({ outcome: 'applied' });
    expect(session.dispatch({ type: 'ClearAnswer', path: itemPath('again') })).toEqual({ outcome: 'unchanged' });
  });

  it('settles in a cycle of its own, with one notification, then takes coded answers (T12)', async () => {
    const { resolver, call } = controlled();
    const session = createSession(FORM, { resolver });
    const changes: SessionChange[] = [];
    session.subscribe((change) => changes.push(change));
    const before = session.getSnapshot();
    call(VS).resolve(CODES);
    await flush();
    expect(changes).toEqual([
      { command: 'OptionsSettled', enabled: [], disabled: [], surfaced: [], added: [], removed: [], completion: null, responseChanged: false },
    ]);
    const after = session.getSnapshot();
    expect(after.cycle).toBe(before.cycle + 1);
    expect(after.nodes).toBe(before.nodes);
    expect(after.optionSets[VS]).toEqual({ status: 'resolved', options: CODES });
    expect(Object.isFrozen(after.optionSets[VS]?.options[0])).toBe(true);
    expect(statuses(session)).toEqual({ [VS]: 'resolved', [OTHER]: 'pending' });
    expect(set(session, 'again', coded('a'))).toEqual({ outcome: 'applied' });
  });

  it('exposes a rejection verbatim to the host, never in a diagnostic, and never retries on its own (AC-07.1.2, INV-X-03)', async () => {
    const { calls, resolver, call } = controlled();
    const onCollaboratorError = vi.fn();
    const session = createSession(FORM, { resolver, onCollaboratorError });
    const error = new Error('SENTINEL: 401 from the terminology server');
    call(VS).reject(error);
    await flush();
    expect(statuses(session)[VS]).toBe('failed');
    const finding = { code: 'resolver-failed', severity: 'warning', path: null, related: [], detail: VS };
    expect(session.diagnostics).toEqual([finding]);
    expect(onCollaboratorError).toHaveBeenCalledWith(error, finding);
    expect(JSON.stringify(session.getSnapshot())).not.toContain('SENTINEL');
    await flush();
    expect(calls).toHaveLength(2);
    expect(set(session, 'again', coded('a'))).toEqual({ outcome: 'refused', reason: 'options-unresolved' });
  });

  it('retries only from failed, on RetryOptions, and reports each failure (AC-07.1.2, M4 plan D6, D7)', async () => {
    const { calls, resolver, call } = controlled();
    const session = createSession(FORM, { resolver });
    const retry = (valueSet: string) => session.dispatch({ type: 'RetryOptions', valueSet });
    expect(retry(VS)).toEqual({ outcome: 'refused', reason: 'options-not-failed' });
    expect(retry('http://example.org/unknown')).toEqual({ outcome: 'refused', reason: 'options-not-failed' });
    call(VS).reject(new Error('down'));
    await flush();
    expect(retry(VS)).toEqual({ outcome: 'applied' });
    expect(session.getSnapshot().change?.command).toBe('RetryOptions');
    expect(statuses(session)[VS]).toBe('pending');
    expect(calls.map((entry) => entry.valueSet)).toEqual([VS, OTHER, VS]);
    expect(retry(VS)).toEqual({ outcome: 'refused', reason: 'options-not-failed' });
    call(VS, 1).reject(new Error('down again'));
    await flush();
    expect(session.diagnostics.map((finding) => finding.code)).toEqual(['resolver-failed', 'resolver-failed']);
    call(OTHER).resolve(CODES);
    expect(retry(VS)).toEqual({ outcome: 'applied' });
    call(VS, 2).resolve(CODES);
    await flush();
    expect(statuses(session)).toEqual({ [VS]: 'resolved', [OTHER]: 'resolved' });
  });

  it('fails a set whose resolver fulfils with something other than codings, and hands the host what came', async () => {
    const { resolver, call } = controlled();
    const onCollaboratorError = vi.fn();
    const session = createSession(FORM, { resolver, onCollaboratorError });
    const junk = [{ display: 'no code' }];
    call(VS).resolve(junk);
    call(OTHER).resolve('not a list');
    await flush();
    expect(statuses(session)).toEqual({ [VS]: 'failed', [OTHER]: 'failed' });
    expect(onCollaboratorError.mock.calls.map(([value]: unknown[]) => value)).toEqual([junk, 'not a list']);
  });

  it('fails a set at once when the resolver throws, and takes a value that is not a promise', async () => {
    const onCollaboratorError = vi.fn();
    const thrown = new Error('sync');
    const session = createSession(FORM, {
      resolver: ((valueSet: string) => {
        if (valueSet === VS) throw thrown;
        return CODES;
      }) as unknown as OptionResolver,
      onCollaboratorError,
    });
    expect(statuses(session)).toEqual({ [VS]: 'failed', [OTHER]: 'pending' });
    expect(onCollaboratorError).toHaveBeenCalledWith(thrown, expect.objectContaining({ code: 'resolver-failed', detail: VS }));
    await flush();
    expect(statuses(session)[OTHER]).toBe('resolved');
  });

  it('with no resolver, loads, marks every set unresolved and reports each item that uses one (INV-D-08, AC-01.1.2)', () => {
    const session = createSession(FORM);
    expect(statuses(session)).toEqual({ [VS]: 'unresolved', [OTHER]: 'unresolved' });
    expect(session.diagnostics.map((finding) => [finding.code, finding.path, finding.detail])).toEqual([
      ['unresolved-options', 'substance', VS],
      ['unresolved-options', 'route', OTHER],
      ['unresolved-options', 'again', VS],
    ]);
    expect(set(session, 'again', coded('a'))).toEqual({ outcome: 'refused', reason: 'options-unresolved' });
    expect(set(session, 'route', text('free text'))).toEqual({ outcome: 'applied' });
    expect(session.dispatch({ type: 'RetryOptions', valueSet: VS })).toEqual({ outcome: 'refused', reason: 'options-not-failed' });
  });

  it('has no option sets, and no resolver calls, for inline options', () => {
    const resolver = vi.fn<OptionResolver>();
    const session = createSession(questionnaire([{ linkId: 'q', type: 'choice', answerOption: [{ valueCoding: { code: 'a' } }] }]), { resolver });
    expect(resolver).not.toHaveBeenCalled();
    expect(session.getSnapshot().optionSets).toEqual({});
    expect(set(session, 'q', [{ kind: 'coding', value: { code: 'a' } }])).toEqual({ outcome: 'applied' });
  });

  it('aborts the signal on dispose, drops a late settlement and refuses every command after (ADR-0012, M4 plan D6)', async () => {
    const { resolver, call } = controlled();
    const session = createSession(FORM, { resolver });
    const listener = vi.fn();
    session.subscribe(listener);
    const before = session.getSnapshot();
    session.dispose();
    expect(call(VS).signal.aborted).toBe(true);
    call(VS).resolve(CODES);
    call(OTHER).reject(new Error('late'));
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(before);
    expect(session.diagnostics).toEqual([]);
    expect(set(session, 'note', text('x'))).toEqual({ outcome: 'refused', reason: 'disposed' });
    expect(session.dispatch({ type: 'RetryOptions', valueSet: VS })).toEqual({ outcome: 'refused', reason: 'disposed' });
    session.dispose();
  });

  it('refuses a command the resolver sends while it is being called (ADR-0009)', async () => {
    const sent: unknown[] = [];
    const box: { session?: Session } = {};
    const resolver: OptionResolver = () => {
      if (box.session !== undefined) sent.push(box.session.dispatch({ type: 'RequestCompletion' }));
      return Promise.reject(new Error('down'));
    };
    const session = createSession(FORM, { resolver });
    box.session = session;
    await flush();
    expect(session.dispatch({ type: 'RetryOptions', valueSet: VS })).toEqual({ outcome: 'applied' });
    expect(sent).toEqual([{ outcome: 'refused', reason: 'collaborator-running' }]);
    expect(session.getSnapshot().status).toBe('in-progress');
  });

  it('lets a listener send a command from a settlement cycle, which runs straight after (ADR-0009)', async () => {
    const { resolver, call } = controlled();
    const session = createSession(FORM, { resolver });
    const results: unknown[] = [];
    session.subscribe((change) => {
      if (change.command === 'OptionsSettled') results.push(set(session, 'again', coded('a')));
    });
    call(VS).resolve(CODES);
    await flush();
    expect(results).toEqual([{ outcome: 'deferred' }]);
    expect(session.getSnapshot().nodes.find((node) => node.path === 'again')?.answers).toEqual(coded('a'));
  });

  it('gives a lenient answerExpression item no options and no coded answer (ADR-0017, M2 plan D13)', () => {
    const expression = { url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-answerExpression', valueExpression: { language: 'text/fhirpath', expression: '%x' } };
    const session = createSession(
      questionnaire([
        { linkId: 'closed', type: 'choice', extension: [expression], answerOption: [{ valueCoding: { code: 'a' } }] },
        { linkId: 'open', type: 'open-choice', extension: [expression] },
      ]),
      { loadMode: 'lenient' },
    );
    expect(session.getSnapshot().nodes.map((node) => node.item.options)).toEqual([[], []]);
    expect(set(session, 'closed', [{ kind: 'coding', value: { code: 'a' } }])).toEqual({ outcome: 'refused', reason: 'not-answerable' });
    expect(set(session, 'open', [{ kind: 'coding', value: { code: 'a' } }])).toEqual({ outcome: 'refused', reason: 'type-mismatch' });
    expect(set(session, 'open', text('free'))).toEqual({ outcome: 'applied' });
  });

  it('calls the resolver once per canonical over any command sequence, identically on every path (INV-X-01, ADR-0005 verification)', () => {
    const commands = fc.array(
      fc.oneof(
        fc.record({ path: fc.constantFrom('uses'), answers: fc.boolean().map(bool) }),
        fc.record({ path: fc.constantFrom('note', 'route'), answers: fc.string({ minLength: 1 }).map(text) }),
        fc.record({ path: fc.constantFrom('again', 'substance', 'route'), answers: fc.constantFrom('a', 'b').map(coded) }),
      ),
      { maxLength: 12 },
    );
    fc.assert(
      fc.property(commands, commands, (first, second) => {
        const record = (script: readonly { path: string; answers: readonly Answer[] }[]) => {
          const seen: string[] = [];
          const session = createSession(FORM, { resolver: (valueSet) => (seen.push(valueSet), new Promise(() => undefined)) });
          for (const { path, answers } of script) set(session, path, answers);
          return seen;
        };
        const a = record(first);
        expect(a).toEqual(record(second));
        expect(a).toEqual([VS, OTHER]);
      }),
      { numRuns: 100 },
    );
  });
});
