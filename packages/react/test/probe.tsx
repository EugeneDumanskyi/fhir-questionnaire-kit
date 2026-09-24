import type { Questionnaire, Session } from '@fhirq/core';
import { useQuestionnaire } from '@fhirq/react';
import { useEffect, type ReactElement } from 'react';

import { SLICE } from '../../core/test/slice.js';

export const COLOURS_VS = 'http://example.org/fhir/ValueSet/colours';

/** The S1 slice plus a choice whose options come from a value set: what the resolver gate is about. */
export const COLOURS = {
  ...SLICE,
  item: [{ linkId: 'colour', type: 'choice', text: 'Favourite colour', answerValueSet: COLOURS_VS }, ...SLICE.item],
} as const satisfies Questionnaire;

/**
 * A headless host (tier 4) on the public hook: one line per node, its path
 * and its option state or control kind. It hands the session out from an
 * effect, as a host would, never during render.
 */
export function Probe({
  source,
  options,
  onSession,
}: {
  readonly source: Questionnaire | Session;
  readonly options?: Parameters<typeof useQuestionnaire>[1];
  readonly onSession?: (session: Session) => void;
}): ReactElement {
  const { session, view } = useQuestionnaire(source, options);
  useEffect(() => {
    onSession?.(session);
  }, [session, onSession]);
  return <output>{view.nodes.map((node) => `${node.path}:${'optionState' in node ? node.optionState : node.control}`).join(' ')}</output>;
}
