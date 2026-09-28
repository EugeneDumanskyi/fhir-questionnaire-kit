import '@fhirq/themes/default.css';
import '@fhirq/themes/base.css';
import './app.css';

import { createSession, type Questionnaire } from '@fhirq/core';
import { createRoot } from 'react-dom/client';

import demo from '../../../fixtures/demo/questionnaire.json?raw';
import { App, type Start } from './app.js';
import { rules, scorers } from './host.js';

// One session for the page: the panes and the tiers read the same one (INV-P-01).
const session = createSession(JSON.parse(demo) as Questionnaire, { scorers, rules });

const page: Start = { session, hostCode: true, source: { text: demo, mode: 'strict', loaded: null }, tier: 1, scheme: 'system', broken: false };

const host = document.querySelector('#root');
if (host !== null) {
  const root = createRoot(host);
  const fragment = location.hash.slice(1);
  // A share link is read before the first render, so the demo never shows in its place.
  if (fragment === '') root.render(<App demo={demo} start={page} />);
  else void import('./share.js').then(({ open }) => open(fragment, page)).then((start) => root.render(<App demo={demo} start={start} />));
}

// A link pasted into an open page's address bar changes only the fragment, which the page reads on load.
window.addEventListener('hashchange', () => location.reload());
