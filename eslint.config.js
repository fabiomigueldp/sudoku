import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'
import importX from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactRefresh.configs.vite,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.worker,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      'react-hooks': reactHooks,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          noWarnOnMultipleProjects: true,
          project: ['tsconfig.app.json', 'tsconfig.node.json'],
        },
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'never'],
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-cycle': ['error', { ignoreExternal: true, maxDepth: 10 }],
      'import-x/no-duplicates': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-unresolved': [
        'error',
        { ignore: ['^virtual:pwa-register$'] },
      ],
      'import-x/no-useless-path-segments': 'error',
      'no-alert': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
])
