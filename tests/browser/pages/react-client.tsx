import { hydrateRoot } from 'react-dom/client';

import { App } from './react-app.js';

const container = document.getElementById('root');
if (container !== null) hydrateRoot(container, <App />);
