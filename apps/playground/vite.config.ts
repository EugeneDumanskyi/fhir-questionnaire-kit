import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// ADR-0019: static, client-only, no backend, no analytics. The playground is
// built from the packages' published entry points, never from their sources.
export default defineConfig({
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
  plugins: [react()],
});
