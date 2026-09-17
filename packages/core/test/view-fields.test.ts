import { describe, expect, it } from 'vitest';

import { createSession } from '../src/index.js';
import { createView, type ViewModel, type YesNoViewNode } from '../src/view/index.js';
import { ALLOWED_COINCIDENCES, deniedBy, HTML_ELEMENTS, INPUT_TYPES } from './deny-lists.js';
import { SLICE } from './slice.js';

/** Every state the slice can show: initial, answered, surfaced, refused, completed. */
function models(): ViewModel[] {
  const session = createSession(SLICE);
  const view = createView(session, { idPrefix: 'fq' });
  const seen = [view.getSnapshot()];
  const step = (act: () => void) => {
    act();
    seen.push(view.getSnapshot());
  };
  step(() => (view.getSnapshot().nodes[0] as YesNoViewNode).set(true));
  step(() => view.getSnapshot().nodes[1]?.leave());
  step(() => session.dispatch({ type: 'RequestCompletion' }));
  step(() => view.getSnapshot().nodes[1]?.clear());
  step(() => (view.getSnapshot().nodes[0] as YesNoViewNode).set(false));
  step(() => session.dispatch({ type: 'RequestCompletion' }));
  return seen;
}

/** Every own key reachable from the model, with the path it was found at. */
function fieldNames(value: unknown, at = 'model', out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    value.forEach((item) => fieldNames(item, `${at}[]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (!out.has(key)) out.set(key, `${at}.${key}`);
      fieldNames(child, `${at}.${key}`, out);
    }
  }
  return out;
}

describe('view-model field list (ADR-0007 review rule, M1 AC-3)', () => {
  const names = new Map<string, string>();
  for (const model of models()) fieldNames(model, 'model', names);

  it('reaches every field the slice produces', () => {
    expect([...names.keys()].sort()).toEqual(
      [
        'announcement', 'choices', 'clear', 'completed', 'control', 'cycle', 'description', 'entries',
        'error', 'errorSummary', 'focusTarget', 'heading', 'headingId', 'id', 'ids', 'invalid', 'issues',
        'label', 'leave', 'message', 'nodes', 'path', 'required', 'requiredMarker', 'rule', 'selected',
        'set', 'target', 'text', 'value',
      ].sort(),
    );
  });

  it('has no field that names an element, an ARIA attribute or a CSS property', () => {
    const violations = [...names]
      .map(([name, where]) => ({ name, where, hit: deniedBy(name) }))
      .filter(({ name, hit }) => hit !== null && !(name in ALLOWED_COINCIDENCES));
    expect(violations).toEqual([]);
  });

  it('allows only the coincidences an ADR names, and each one is still in use', () => {
    for (const name of Object.keys(ALLOWED_COINCIDENCES)) {
      expect(deniedBy(name)).not.toBeNull();
      expect(names.has(name)).toBe(true);
    }
  });

  it('names control kinds semantically, never after an element or input type', () => {
    const kinds = new Set(models().flatMap((model) => model.nodes.map((node) => node.control)));
    expect([...kinds].sort()).toEqual(['short-text', 'yes-no']);
    for (const kind of kinds) {
      expect(HTML_ELEMENTS.has(kind) || INPUT_TYPES.has(kind)).toBe(false);
    }
  });

  it('catches the drift it exists to catch', () => {
    expect(deniedBy('fieldset')).toBe('an HTML element');
    expect(deniedBy('ariaDescribedBy')).toBe('an ARIA attribute');
    expect(deniedBy('aria-invalid')).toBe('an ARIA attribute');
    expect(deniedBy('role')).toBe('an ARIA attribute');
    expect(deniedBy('display')).toBe('a CSS property');
    expect(deniedBy('insetInlineStart')).toBe('a CSS property');
    expect(deniedBy('invalid')).toBeNull();
    expect(deniedBy('errorSummary')).toBeNull();
  });
});
