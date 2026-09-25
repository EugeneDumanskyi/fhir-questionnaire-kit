import { describe, expect, it } from 'vitest';

import { FhirqError } from '../../src/kernel/error.js';

describe('FhirqError', () => {
  it('is an Error whose message is its code, with its findings, and no cause unless given one', () => {
    const error = new FhirqError('invalid-options');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'FhirqError', message: 'invalid-options', code: 'invalid-options', findings: [] });
    expect('cause' in error).toBe(false);
  });

  it('carries what failed underneath verbatim, as its cause (ADR-0012 M7 note)', () => {
    const cause = new TypeError('Failed to fetch');
    const error = new FhirqError('request-failed', [], { cause });
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('request-failed');
  });
});
