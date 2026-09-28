import '@fhirq/themes/default.css';
import '@fhirq/themes/base.css';
import './app.css';

import { createSession, type Questionnaire } from '@fhirq/core';
import { createRoot } from 'react-dom/client';

import demo from '../../../fixtures/demo/questionnaire.json?raw';
import { App } from './app.js';
import { rules, scorers } from './host.js';

// One session for the page: the panes and the tiers read the same one (INV-P-01).
const session = createSession(JSON.parse(demo) as Questionnaire, { scorers, rules });

const host = document.querySelector('#root');
if (host !== null) {
  createRoot(host).render(<App demo={demo} session={session} />);
}
