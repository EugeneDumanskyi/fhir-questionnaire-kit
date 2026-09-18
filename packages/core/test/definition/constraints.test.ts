import { describe, expect, it } from 'vitest';

import { createSession, type FhirqError } from '../../src/index.js';
import { questionnaire } from '../slice.js';

const EXT = 'http://hl7.org/fhir/StructureDefinition/';

describe('constraint extensions at load (INV-D-20)', () => {
  const load = (item: Record<string, unknown>, loadMode: 'strict' | 'lenient' = 'strict') =>
    createSession(questionnaire([{ linkId: 'q', ...item }]), { loadMode });
  const rejected = (item: Record<string, unknown>) => {
    try {
      load(item);
    } catch (error) {
      return (error as FhirqError).findings.map((finding) => [finding.code, finding.detail]);
    }
    return [];
  };

  it.each([
    [{ type: 'string', extension: [{ url: `${EXT}minValue`, valueInteger: 1 }] }, 'minValue'],
    [{ type: 'integer', extension: [{ url: `${EXT}maxValue`, valueDate: '2020' }] }, 'maxValue'],
    [{ type: 'date', extension: [{ url: `${EXT}minValue`, valueTime: '10:00:00' }] }, 'minValue'],
    [{ type: 'integer', extension: [{ url: `${EXT}maxDecimalPlaces`, valueInteger: 1 }] }, 'maxDecimalPlaces'],
    [{ type: 'string', extension: [{ url: `${EXT}questionnaire-maxOccurs`, valueInteger: 1 }] }, 'occurs'],
    [
      { type: 'string', repeats: true, extension: [{ url: `${EXT}questionnaire-minOccurs`, valueInteger: 3 }, { url: `${EXT}questionnaire-maxOccurs`, valueInteger: 2 }] },
      'occurs',
    ],
  ])('rejects a constraint its item cannot have in strict mode, and ignores it in lenient (%#)', (item, detail) => {
    expect(rejected(item)).toEqual([['inapplicable-constraint', detail]]);
    const session = load(item, 'lenient');
    expect(session.diagnostics.map((finding) => [finding.code, finding.severity, finding.detail])).toEqual([['inapplicable-constraint', 'error', detail]]);
    expect(session.getSnapshot().nodes[0]?.item).toMatchObject({ minOccurs: 0, maxOccurs: null });
  });

  it('rejects a malformed limit in both modes (INV-D-01)', () => {
    expect(rejected({ type: 'integer', extension: [{ url: `${EXT}minValue`, valueInteger: 'one' }] })).toEqual([['malformed', `${EXT}minValue`]]);
    expect(rejected({ type: 'integer', extension: [{ url: `${EXT}minValue`, valueInteger: 1, valueDecimal: 1 }] })).toEqual([['malformed', `${EXT}minValue`]]);
  });

  it('accepts an integer limit on a decimal item and the reverse', () => {
    expect(() => load({ type: 'integer', extension: [{ url: `${EXT}minValue`, valueDecimal: 1.5 }] })).not.toThrow();
  });
});
