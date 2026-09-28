import { Questionnaire, useQuestionnaire } from '@fhirq/react';
import { StrictMode, useEffect, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { FORMS } from './forms.js';
import { Headless } from './headless.js';
import { MATRIX_FORMS, type MatrixForm } from './names.js';
import { CONTROLS } from './tier3.js';

/**
 * React's pages of M8's axe matrix, rendered on the client (plan D4): the
 * form `#root` names, in the tier it names (`forms.ts`).
 */

function Matrix({ form, tier }: { readonly form: MatrixForm; readonly tier: string }): ReactElement {
  const { session, view } = useQuestionnaire(FORMS[form].form, { options: FORMS[form].options });
  useEffect(() => {
    Object.assign(window, { fhirq: { session, ready: true } });
  }, [session]);
  if (tier === '4') return <Headless session={session} view={view} />;
  return <Questionnaire session={session} {...(tier === '3' ? { controls: CONTROLS } : {})} />;
}

const container = document.getElementById('root');
const form = MATRIX_FORMS.find((name) => name === container?.dataset['form']);
if (container !== null && form !== undefined)
  createRoot(container).render(
    <StrictMode>
      <Matrix form={form} tier={container.dataset['tier'] ?? '1'} />
    </StrictMode>,
  );
