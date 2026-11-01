import { defineConfig, type ViteUserConfig } from 'vitest/config';

// Shared test settings for one format package. Pass only what differs.
export function formatTest(overrides: NonNullable<ViteUserConfig['test']> = {}) {
  return defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.ts'],
      ...overrides,
    },
  });
}
