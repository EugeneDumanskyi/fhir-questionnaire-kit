import { createRoot } from 'react-dom/client';

import { App } from './app.js';

// M0 placeholder mount. The real playground is M9 (06-roadmap.md §3).
const host = document.querySelector('#root');
if (host !== null) {
  createRoot(host).render(<App />);
}
