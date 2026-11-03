import { defineConfig, type ViteUserConfig } from 'vitest/config';

type TestConfig = NonNullable<ViteUserConfig['test']>;

export interface FormatTestOptions extends Omit<TestConfig, 'browser'> {
  /**
   * Run this package's tests in a real browser (headless Chromium through
   * vitest browser mode) instead of jsdom. The default is jsdom. Opting in needs
   * two dev dependencies at the root, `@vitest/browser` and
   * `@vitest/browser-playwright` (matching the vitest version), and Playwright's
   * Chromium (`npx playwright install chromium`, also in CI). Tests written
   * against the contract conformance suites run unchanged in either.
   */
  browser?: boolean;
}

const include = ['src/**/*.{test,spec}.ts'];

// Shared test settings for one format package. Pass only what differs.
export function formatTest(options: FormatTestOptions = {}) {
  const { browser, ...overrides } = options;
  if (!browser) {
    return defineConfig({ test: { environment: 'jsdom', include, ...overrides } });
  }
  return defineConfig(async () => {
    // Resolved only when a package opts in, so the dependency is not required
    // until then (a literal specifier would be resolved when the config bundles).
    const provider = '@vitest/browser-playwright';
    const { playwright } = (await import(/* @vite-ignore */ provider)) as {
      playwright: () => NonNullable<TestConfig['browser']>['provider'];
    };
    return {
      test: {
        include,
        browser: {
          enabled: true,
          headless: true,
          provider: playwright(),
          instances: [{ browser: 'chromium' }],
        },
        ...overrides,
      },
    };
  });
}

/**
 * Shared test settings for one app package: the same files as `formatTest`, run
 * in Node, since an app's root entry is its DOM-free core. A test of the app's
 * element (later) opts into jsdom on its own first line:
 * `// @vitest-environment jsdom`.
 */
export function appTest(options: Omit<TestConfig, 'browser'> = {}) {
  return defineConfig({ test: { environment: 'node', include, ...options } });
}
