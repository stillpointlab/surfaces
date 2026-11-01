import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
// The full plugin loads an unused rule that imports minimatch's removed makeRe API.
import importOrder from 'eslint-plugin-import-x/rules/order';
import globals from 'globals';

// One lint config for every format package. Packages add nothing of their own.
export default [
  {
    ignores: [
      '**/dist/**',
      '**/dist-dev/**',
      '**/node_modules/**',
      // generated from *.scss by tooling/gen-styles.mjs
      '**/*.styles.ts',
    ],
  },
  eslint.configs.recommended,
  {
    files: [
      'packages/{formats,apps}/*/{src,dev}/**/*.ts',
      'tooling/**/*.ts',
      '*.config.ts',
      'packages/{formats,apps}/*/*.config.ts',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import-x': { rules: { order: importOrder } },
    },
    rules: {
      // TypeScript itself catches undefined identifiers; the core rule produces
      // false positives on type-only references.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // Node build scripts.
    files: ['tooling/**/*.mjs', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  prettier,
];
