import { defineConfig } from 'vitest/config';

import { browserPackages } from './tooling/browser-projects.ts';
import { requireChromium } from './tooling/vitest.ts';

// The browser runner: every package that has browser tests keeps a
// vitest.browser.config.ts (built from `browserTest` in tooling/vitest.ts) beside
// its vitest.config.ts. `npm run test:browser` runs them all in headless
// Chromium; `npm run test:browser -- --project <package name>` runs one. A pull
// request's CI runs those of the packages it changes; see the README's testing
// section. The packages are those `browserPackages` finds among the workspaces,
// the one list CI chooses from too. Without Playwright's Chromium the run stops
// here, once, before any package's config is loaded.
export default defineConfig(async () => {
  await requireChromium();
  return {
    test: {
      projects: browserPackages(import.meta.dirname).map(
        ({ dir }) => `${dir}/vitest.browser.config.ts`
      ),
    },
  };
});
