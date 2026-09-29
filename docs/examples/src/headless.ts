import { createSession } from '@fhirq/core';

import { smoking as questionnaire } from './questionnaires.js';

// #region headless
import { createView, type ViewNode } from '@fhirq/core/view';

const view = createView(createSession(questionnaire), { idPrefix: 'intake', locale: 'en' });

/** A host's own renderer, here to plain lines: each question's label, its required marker, and its issues. */
const draw = (nodes: readonly ViewNode[], marker: string): string[] =>
  nodes.map((node) => [node.label, node.required ? marker : '', ...node.issues.map((issue) => issue.message)].filter(Boolean).join(' '));

const lines = draw(view.getSnapshot().nodes, view.getSnapshot().requiredMarker);
// #endregion

export { lines, view };
