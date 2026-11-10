// ── Vitest config for the rbm web-app ──
//
// We keep `vite.config.js` untouched (it owns the build pipeline,
// manual chunk splitting, tailwind plugin, dev proxy, etc.) and merge
// its plugin/alias resolution into a separate vitest config so the
// test runner inherits the same `@/` alias and React plugin without
// any duplication.
//
// Stack: React 19 + Vite 7 + Vitest 3 + jsdom + RTL 16 (the first RTL
// release that supports React 19).
//
// Per CLAUDE.md "Mandatory Testing Policy": coverage threshold is 80%
// on branches / functions / lines / statements.

import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // jsdom gives us a `document`, `window`, and other browser-ish
      // globals so React Testing Library can mount components.
      environment: 'jsdom',
      // `globals: true` makes describe / it / expect / vi available
      // without imports — matches the Jest-style ergonomics referenced
      // in CLAUDE.md.
      globals: true,
      // Setup file runs once per worker BEFORE the suite — registers
      // jest-dom matchers, cleans up after each test, and stubs the
      // central API client + react-router-dom navigation hooks.
      setupFiles: ['./src/__tests__/setup.js'],
      // Don't process CSS inside JSX imports — speeds tests up by ~3×
      // and tailwind classes don't matter for behaviour assertions.
      css: false,
      // Colocated tests live under `src/**/__tests__/*.test.{js,jsx}`.
      include: ['src/**/__tests__/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.idea/**',
        '.git/**',
      ],
      // Default 5s. 30s absorbs worker starvation when the pre-push hook
      // runs BOTH full suites under load — synchronous tests were flaking
      // at 10s purely from machine contention (ApprovalHistoryTimeline,
      // 2× failed pushes on 2026-07-14). Does not slow passing tests.
      testTimeout: 30000,
      // Reset mock state between tests for determinism.
      clearMocks: true,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'html', 'lcov'],
        reportsDirectory: './coverage',
        thresholds: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        include: ['src/**/*.{js,jsx}'],
        exclude: [
          'node_modules/**',
          'dist/**',
          'src/main.jsx',
          'src/**/*.config.{js,jsx}',
          'src/**/*.test.{js,jsx}',
          'src/**/__tests__/**',
          // Static reference data — no logic to cover.
          'src/data/**',
          // Pure asset / type-style files.
          'src/assets/**',
        ],
      },
    },
  }),
);
