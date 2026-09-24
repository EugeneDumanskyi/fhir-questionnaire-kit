import type { Questionnaire as Form, QuestionnaireResponse } from '@fhirq/core';
import { Questionnaire } from '@fhirq/react';
import { useEffect, useState, version, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import LARGE from '../../../fixtures/bench/large-500.json';
import DEMO from '../../../fixtures/demo/questionnaire.json';
import { TYPED, type Typed } from './names.js';

/** How many responses the cloning host was handed. */
const seen = { changes: 0 };

/**
 * A host controlling the form by response that stores a structured clone of
 * each one, so every keystroke hands the adapter a new object to compare by
 * content (ADR-0015's second step).
 */
function Cloned(): ReactElement {
  const [value, setValue] = useState<QuestionnaireResponse>();
  return (
    <Questionnaire
      questionnaire={LARGE as Form}
      {...(value === undefined ? {} : { value })}
      onChange={(response) => {
        seen.changes += 1;
        setValue(structuredClone(response));
      }}
    />
  );
}

const FORMS: Readonly<Record<Typed, () => ReactElement>> = {
  control: () => <textarea aria-label="Control" />,
  demo: () => <Questionnaire questionnaire={DEMO as Form} />,
  'large-500': () => <Questionnaire questionnaire={LARGE as Form} />,
  'large-500-cloned': () => <Cloned />,
};

/** Marks the first commit, so the proof types into a mounted form. */
function Ready(): null {
  useEffect(() => {
    Object.assign(window, { fhirq: { ready: true, react: version, seen } });
  }, []);
  return null;
}

const container = document.getElementById('root');
const form = TYPED.find((name): name is Typed => name === container?.dataset['page']);
if (container !== null && form !== undefined) {
  createRoot(container).render(
    <>
      {FORMS[form]()}
      <Ready />
    </>,
  );
}
