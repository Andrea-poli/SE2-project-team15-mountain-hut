import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      'e2e/.tmp/**',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Server and root config files run in Node
  {
    files: ['server/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  // Time: only clock.js may read the real time, everything else uses now() (fixed in tests and E2E).
  // new Date(value) with an argument is allowed: it parses a date, it does not read the clock.
  {
    files: ['server/src/**/*.js'],
    ignores: ['server/src/clock.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Use now() from clock.js' },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use now() from clock.js',
        },
      ],
    },
  },
  // E2E tests run in Node, with code passed to the browser (page.evaluate)
  {
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Client runs in the browser
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['client/vite.config.js'],
    languageOptions: { globals: globals.node },
  },
];
