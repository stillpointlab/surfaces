import { existsSync } from 'node:fs';

import { configDefaults, defineConfig, type ViteUserConfig } from 'vitest/config';

type TestConfig = NonNullable<ViteUserConfig['test']>;

export type FormatTestOptions = Omit<TestConfig, 'browser'>;

const include = ['src/**/*.{test,spec}.ts'];
// What only a real browser can test lives in `*.browser.test.ts`, which
// `browserTest` runs and the jsdom and Node runs leave alone.
const browserInclude = ['src/**/*.browser.test.ts'];
const exclude = [...configDefaults.exclude, ...browserInclude];

// Shared test settings for one format package. Pass only what differs.
export function formatTest(options: FormatTestOptions = {}) {
  return defineConfig({ test: { environment: 'jsdom', include, exclude, ...options } });
}

/**
 * Shared test settings for one app package: the same files as `formatTest`, run
 * in Node, since an app's root entry is its DOM-free core. A test of the app's
 * element (later) opts into jsdom on its own first line:
 * `// @vitest-environment jsdom`.
 */
export function appTest(options: FormatTestOptions = {}) {
  return defineConfig({ test: { environment: 'node', include, exclude, ...options } });
}

/**
 * A package's browser tests: its `src/**\/*.browser.test.ts`, in headless
 * Chromium through vitest's browser mode, for what jsdom cannot do (play a clip,
 * seek in it, draw a page). A package that has them keeps this in
 * `vitest.browser.config.ts` beside its `vitest.config.ts`; the root's
 * `vitest.browser.config.ts` collects those, and `npm run test:browser` runs them.
 * `npm test` never does.
 *
 * Media plays without a gesture, since a test cannot click first. Without
 * Playwright's Chromium on the machine the run stops at once and names the
 * command that installs it.
 */
export function browserTest(options: FormatTestOptions = {}) {
  return defineConfig(async () => {
    // Loaded here, so the jsdom configs beside it never load Playwright.
    const [{ playwright }, { chromium }] = await Promise.all([
      import('@vitest/browser-playwright'),
      import('playwright'),
    ]);
    const executable = chromium.executablePath();
    if (!existsSync(executable)) {
      throw new Error(
        `Playwright's Chromium is not installed (no ${executable}).\n` +
          'Install it with: npx playwright install chromium\n' +
          "(on a Linux machine without the browser's system libraries: npx playwright install --with-deps chromium)"
      );
    }
    return {
      test: {
        include: browserInclude,
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({
            launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
          }),
          instances: [{ browser: 'chromium' as const }],
          // A failure is read in its words; screenshots are not kept.
          screenshotFailures: false,
        },
        ...options,
      },
    };
  });
}
