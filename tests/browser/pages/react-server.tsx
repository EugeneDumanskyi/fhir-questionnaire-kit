import { renderToString } from 'react-dom/server';

import { App } from './react-app.js';

/** The server half of the hydration proof: the same tree, rendered in Node. */
export function render(): string {
  return renderToString(<App />);
}
