import { hydrateRoot } from 'react-dom/client';

import { App } from './react-app.js';
import { PAGES, type Page } from './names.js';

const container = document.getElementById('root');
const page = PAGES.find((name): name is Page => name === container?.dataset['page']);
if (container !== null && page !== undefined) hydrateRoot(container, <App page={page} />);
