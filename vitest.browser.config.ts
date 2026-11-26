import { defineConfig } from 'vitest/config';

// The browser runner: every package that has browser tests keeps a
// vitest.browser.config.ts (built from `browserTest` in tooling/vitest.ts) beside
// its vitest.config.ts. `npm run test:browser` runs them all in headless
// Chromium; `npm run test:browser -- --project <package name>` runs one. A pull
// request's CI runs those of the packages it changes; see the README's testing
// section.
export default defineConfig({
  test: {
    projects: [
      // common, the one package at this depth
      'packages/*/vitest.browser.config.ts',
      'packages/components/*/vitest.browser.config.ts',
      'packages/formats/*/vitest.browser.config.ts',
      'packages/apps/*/vitest.browser.config.ts',
      'packages/hosts/*/vitest.browser.config.ts',
      'tooling/template/*/vitest.browser.config.ts',
    ],
  },
});
