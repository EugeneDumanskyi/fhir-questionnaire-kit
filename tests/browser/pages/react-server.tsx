import { renderToString } from 'react-dom/server';

import { App } from './react-app.js';
import type { Page } from './names.js';

/** The server half of the hydration proof: the same tree, rendered in Node. */
export function render(page: Page): string {
  return renderToString(<App page={page} />);
}
