import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { csp, fromDist } from './vite/plugins.js';

// ADR-0019: static, client-only, no backend, no analytics. The playground is
// built from the packages' published entry points, never from their sources
// (`fromDist`), with relative asset paths so one build serves under any path,
// Pages' `/<repo>/playground/` among them, and with the CSP in built pages.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
  plugins: [react(), csp(), fromDist()],
});
