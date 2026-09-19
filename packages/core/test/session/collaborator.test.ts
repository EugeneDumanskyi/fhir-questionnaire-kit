import { describe, expect, it, vi } from 'vitest';

import { diagnostic, type Diagnostic } from '../../src/kernel/diagnostic.js';
import { collaborators } from '../../src/session/collaborator.js';
import { createSession, FhirqError, itemPath, type Session, type SessionOptions } from '../../src/index.js';
import { bool, questionnaire, SLICE } from '../slice.js';

/** The one guard every call into host code goes through (BC5, ADR-0006, INV-X-09, M4 plan D7). */

const finding = diagnostic('rule-threw', 'warning', null, { detail: 'rules[0]' });

describe('the collaborator guard (M4 plan D7)', () => {
  it('returns what the call returned, and is busy only while it runs', () => {
    const guard = collaborators(() => undefined, undefined);
    let inside = false;
    expect(guard.call(finding, () => ((inside = guard.busy()), 42))).toEqual({ value: 42 });
    expect(inside).toBe(true);
    expect(guard.busy()).toBe(false);
  });

  it('turns a throw into null, reports the finding once per session, and hands the error over every time', () => {
    const reported: Diagnostic[] = [];
    const onError = vi.fn();
    const guard = collaborators((found) => reported.push(found), onError);
    const thrown = new Error('x');
    const fail = () => {
      throw thrown;
    };
    expect(guard.call(finding, fail)).toBeNull();
    expect(guard.call(finding, fail)).toBeNull();
    expect(guard.busy()).toBe(false);
    expect(reported).toEqual([finding]);
    expect(onError.mock.calls).toEqual([
      [thrown, finding],
      [thrown, finding],
    ]);
    guard.call(diagnostic('rule-threw', 'warning', null, { detail: 'rules[1]' }), fail);
    guard.call(finding, fail, true);
    expect(reported.map((found) => found.detail)).toEqual(['rules[0]', 'rules[1]', 'rules[0]']);
  });

  it('calls the handler outside the busy window, and turns a throwing handler into listener-threw', () => {
    const reported: Diagnostic[] = [];
    let busy: boolean | undefined;
    const guard = collaborators(
      (found) => reported.push(found),
      () => {
        busy = guard.busy();
        throw new Error('handler');
      },
    );
    guard.call(finding, () => {
      throw new Error('rule');
    });
    expect(busy).toBe(false);
    expect(reported.map((found) => found.code)).toEqual(['rule-threw', 'listener-threw']);
  });

  it('keeps each once-only finding apart by code, path and detail', () => {
    const reported: Diagnostic[] = [];
    const guard = collaborators((found) => reported.push(found), undefined);
    guard.once(diagnostic('evaluator-threw', 'warning', 'a'));
    guard.once(diagnostic('evaluator-threw', 'warning', 'a', { detail: 'type' }));
    guard.once(diagnostic('evaluator-threw', 'warning', 'b'));
    guard.once(diagnostic('evaluator-threw', 'warning', 'a'));
    expect(reported.map((found) => [found.path, found.detail])).toEqual([
      ['a', null],
      ['a', 'type'],
      ['b', null],
    ]);
  });
});

describe('host code inside a session (ADR-0009, M4 AC-5, AC-6)', () => {
  const FORM = questionnaire([
    { linkId: 'a', type: 'boolean' },
    { linkId: 'b', type: 'boolean' },
  ]);

  it('refuses a command a rule sends, while a listener\'s is still deferred', () => {
    const box: { session?: Session } = {};
    const fromRule: unknown[] = [];
    box.session = createSession(FORM, {
      rules: [{ inputs: ['a'], check: () => (fromRule.push(box.session?.dispatch({ type: 'SetAnswer', path: itemPath('b'), answers: bool(true) })), null) }],
    });
    fromRule.length = 0;
    const session = box.session;
    const fromListener: unknown[] = [];
    session.subscribe(() => {
      if (fromListener.length === 0) fromListener.push(session.dispatch({ type: 'ClearAnswer', path: itemPath('a') }));
    });
    session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) });
    expect(fromRule).toEqual([{ outcome: 'refused', reason: 'collaborator-running' }, { outcome: 'refused', reason: 'collaborator-running' }]);
    expect(fromListener).toEqual([{ outcome: 'deferred' }]);
    expect(session.getSnapshot().nodes.map((node) => node.answers)).toEqual([[], []]);
  });

  it('hands a throwing rule\'s error to the host verbatim, and keeps the form live (AC-04.3.2)', () => {
    const onCollaboratorError = vi.fn();
    const thrown = Object.assign(new Error('rule failed'), { secret: 'SENTINEL' });
    const session = createSession(FORM, {
      onCollaboratorError,
      rules: [
        {
          inputs: ['a'],
          check: () => {
            throw thrown;
          },
        },
      ],
    });
    expect(session.dispatch({ type: 'SetAnswer', path: itemPath('a'), answers: bool(true) })).toEqual({ outcome: 'applied' });
    expect(onCollaboratorError).toHaveBeenLastCalledWith(thrown, expect.objectContaining({ code: 'rule-threw', detail: 'rules[0]' }));
    expect(JSON.stringify(session.diagnostics)).not.toContain('SENTINEL');
  });

  it.each([
    ['a resolver that is not a function', { resolver: 'http://terminology' }],
    ['an evaluator without evaluate', { evaluator: {} }],
    ['a null evaluator', { evaluator: null }],
    ['a sanitizer that is not a function', { sanitize: true }],
    ['an error handler that is not a function', { onCollaboratorError: 'log' }],
  ])('rejects %s as invalid-options', (_, options) => {
    expect(() => createSession(SLICE, options as unknown as SessionOptions)).toThrow(new FhirqError('invalid-options'));
  });
});
