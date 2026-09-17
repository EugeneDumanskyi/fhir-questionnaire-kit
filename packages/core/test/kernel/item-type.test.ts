import { describe, expect, it } from 'vitest';

import { diagnostic } from '../../src/kernel/diagnostic.js';
import { FhirqError } from '../../src/kernel/error.js';
import { isItemType, isOperator, ITEM_TYPES, OPERATORS } from '../../src/kernel/item-type.js';

describe('item types and operators', () => {
  it('supports exactly the twelve types of AC-01.2.1', () => {
    expect([...ITEM_TYPES].sort()).toEqual(
      ['boolean', 'choice', 'date', 'dateTime', 'decimal', 'display', 'group', 'integer', 'open-choice', 'quantity', 'string', 'text'].sort(),
    );
    expect(isItemType('open-choice')).toBe(true);
    for (const unsupported of ['time', 'url', 'attachment', 'reference', 'question', 'coding']) {
      expect(isItemType(unsupported)).toBe(false);
    }
  });

  it('knows the seven operators of AC-02.1.3 and nothing else', () => {
    expect(OPERATORS).toHaveLength(7);
    expect(isOperator('>=')).toBe(true);
    expect(isOperator('==')).toBe(false);
  });
});

describe('diagnostics and integration errors (NFR-X-04)', () => {
  it('carries a code, a severity, a path and authored names only', () => {
    expect(diagnostic('dependency-cycle', 'error', 'a', { related: ['a', 'b'] })).toEqual({
      code: 'dependency-cycle', severity: 'error', path: 'a', related: ['a', 'b'], detail: null,
    });
    expect(diagnostic('unsupported-item-type', 'error', 'x', { detail: 'attachment' }).detail).toBe('attachment');
  });

  it('throws a typed error whose message is its code and which lists every finding', () => {
    const findings = [diagnostic('duplicate-link-id', 'error', 'a'), diagnostic('dangling-condition', 'error', 'b')];
    const error = new FhirqError('definition-rejected', findings);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'FhirqError', code: 'definition-rejected', message: 'definition-rejected', findings });
    expect(new FhirqError('invalid-options').findings).toEqual([]);
  });
});
