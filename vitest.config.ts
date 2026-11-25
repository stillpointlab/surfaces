import { defineConfig } from 'vitest/config';

// Root runner: every package is a project with its own vitest.config.ts
// (built from tooling/vitest.ts), the format templates among them, so a template
// is tested where it lies. `npm test` here runs them all.
export default defineConfig({
  test: {
    projects: [
      'packages/common/vitest.config.ts',
      'packages/components/*/vitest.config.ts',
      'packages/formats/*/vitest.config.ts',
      'packages/apps/*/vitest.config.ts',
      'packages/hosts/*/vitest.config.ts',
      'tooling/template/*/vitest.config.ts',
    ],
  },
});
