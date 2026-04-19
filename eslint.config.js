// @ts-check
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

const TEST_FILES = ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'];

const sharedRules = {
  'eqeqeq': ['error', 'always'],
  'no-throw-literal': 'error',
  'no-console': 'warn',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/explicit-function-return-type': [
    'warn',
    { allowExpressions: true, allowTypedFunctionExpressions: true },
  ],
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
};

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'jest.config.js', 'eslint.config.js'],
  },
  // Production source files — checked with tsconfig.json (no Jest types).
  // Accidental use of Jest globals (describe, expect, jest, …) will cause a
  // type error here even though they are invisible at runtime.
  {
    files: ['src/**/*.ts'],
    ignores: TEST_FILES,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: sharedRules,
  },
  // Test files — checked with tsconfig.test.json (Jest types included).
  {
    files: TEST_FILES,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.test.json',
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: sharedRules,
  },
];
