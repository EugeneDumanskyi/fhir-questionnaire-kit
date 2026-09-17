import { describe, expect, it } from 'vitest';

import { FhirqError } from '../../src/kernel/error.js';
import { childPath, instancePath, itemPath } from '../../src/kernel/path.js';

describe('item paths (AC-03.4.1, 04-domain.md T11)', () => {
  it('addresses a root item by its encoded linkId, as the slice did', () => {
    expect(itemPath('smoker')).toBe('smoker');
    expect(itemPath('a b')).toBe('a%20b');
  });

  it('joins segments with / and marks a repeat instance with its ordinal', () => {
    expect(itemPath('history', 'meds', 2, 'dose')).toBe('history/meds[2]/dose');
    expect(itemPath('outer', 0, 'inner', 3, 'q')).toBe('outer[0]/inner[3]/q');
    expect(itemPath('meds', 1)).toBe('meds[1]');
  });

  it('encodes an authored /, [ or ] so it can never read as structure', () => {
    const tricky = itemPath('a/b[1]');
    expect(tricky).toBe('a%2Fb%5B1%5D');
    expect(tricky).not.toBe(itemPath('a', 'b', 1));
  });

  it('matches the building blocks the session uses', () => {
    const group = childPath(null, 'meds');
    expect(childPath(instancePath(group, 4), 'dose')).toBe(itemPath('meds', 4, 'dose'));
  });

  it.each([
    ['nothing', []],
    ['an empty linkId', ['']],
    ['an ordinal first', [0, 'a']],
    ['two ordinals in a row', ['a', 1, 2]],
    ['a negative ordinal', ['a', -1]],
    ['a fractional ordinal', ['a', 1.5]],
    ['an unsafe ordinal', ['a', Number.MAX_SAFE_INTEGER + 1]],
  ] as const)('rejects %s as an integration error', (_, parts) => {
    expect(() => itemPath(...parts)).toThrow(new FhirqError('invalid-path'));
  });
});
