import { describe, expect, it, vi } from 'vitest';

import { createSession, type Questionnaire, type Session } from '../../src/index.js';
import { restoreSession, snapshot } from '../../src/resume.js';
import { questionnaire } from '../slice.js';

/** INV-X-06, AC-01.4.2 (M4 plan D3): rich text only through the host's sanitizer. */

const RAW = '<p onclick="steal()">Rate your <b>pain</b></p>';
const rich = (linkId: string, xhtml: string) => ({
  linkId,
  type: 'string' as const,
  text: 'Rate your pain',
  _text: { extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/rendering-xhtml', valueString: xhtml }] },
});
const FORM: Questionnaire = questionnaire([rich('pain', RAW), { linkId: 'plain', type: 'string', text: '<b>not markup</b>' }]);

const xhtml = (session: Session) => session.getSnapshot().nodes.map((node) => [node.path, node.item.text, node.item.xhtml]);

describe('authored rich text (INV-X-06, AC-01.4.2)', () => {
  it('keeps no rich text without a sanitizer: plain text renders, and a diagnostic says so', () => {
    const session = createSession(FORM);
    expect(xhtml(session)).toEqual([
      ['pain', 'Rate your pain', null],
      ['plain', '<b>not markup</b>', null],
    ]);
    expect(session.diagnostics).toEqual([{ code: 'no-sanitizer', severity: 'warning', path: 'pain', related: [], detail: null }]);
    expect(JSON.stringify(session.getSnapshot())).not.toContain('onclick');
  });

  it('passes it through the sanitizer once, as the session opens, and keeps only its output', () => {
    const sanitize = vi.fn((markup: string) => markup.replace(/ on\w+="[^"]*"/g, ''));
    const session = createSession(FORM, { sanitize });
    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(sanitize).toHaveBeenCalledWith(RAW);
    expect(xhtml(session)[0]).toEqual(['pain', 'Rate your pain', '<p>Rate your <b>pain</b></p>']);
    expect(session.diagnostics).toEqual([]);
    expect(JSON.stringify(session.getSnapshot())).not.toContain('onclick');
  });

  it('keeps no rich text when the sanitizer throws, reports it without the text, and hands the error over', () => {
    const onCollaboratorError = vi.fn();
    const thrown = new Error(`bad markup: ${RAW}`);
    const session = createSession(FORM, {
      onCollaboratorError,
      sanitize: () => {
        throw thrown;
      },
    });
    expect(xhtml(session)[0]?.[2]).toBeNull();
    expect(session.diagnostics).toEqual([{ code: 'sanitizer-threw', severity: 'warning', path: 'pain', related: [], detail: null }]);
    expect(onCollaboratorError).toHaveBeenCalledWith(thrown, session.diagnostics[0]);
  });

  it('keeps no rich text when the sanitizer returns something other than a string', () => {
    const session = createSession(FORM, { sanitize: (() => null) as unknown as (markup: string) => string });
    expect(xhtml(session)[0]?.[2]).toBeNull();
    expect(session.diagnostics.map((finding) => [finding.code, finding.detail])).toEqual([['sanitizer-threw', 'type']]);
  });

  it('never calls the sanitizer for a questionnaire without rich text, and sanitizes again on restore', () => {
    const sanitize = vi.fn((markup: string) => markup);
    createSession(questionnaire([{ linkId: 'q', type: 'string' }]), { sanitize });
    expect(sanitize).not.toHaveBeenCalled();
    const saved = snapshot(createSession(FORM, { sanitize }));
    expect(JSON.stringify(saved)).not.toContain('onclick');
    expect(xhtml(restoreSession(FORM, saved, { sanitize }))[0]?.[2]).toBe(RAW);
    expect(sanitize).toHaveBeenCalledTimes(2);
  });
});
