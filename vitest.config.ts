import { defineConfig } from 'vitest/config';

/**
 * One Vitest run over the workspace. Every project here is `environment: node`
 * with no DOM shim, on purpose: NFR-C-04 says the engine runs in Node, and a
 * jsdom default is how that claim quietly stops being tested. The renderers get
 * their own browser-backed projects when they have something to render (M6, M7).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'react',
          root: './packages/react',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'element',
          root: './packages/element',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'themes',
          root: './packages/themes',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'eslint-rules',
          root: './tools/eslint-rules',
          environment: 'node',
          include: ['test/**/*.test.js'],
        },
      },
    ],
  },
});
