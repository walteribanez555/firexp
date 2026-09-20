// @ts-check
const eslint   = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Production source files use the strict tsconfig (excludes __tests__)
    files:   ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project:         './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars':         ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any':         'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    // Test files use tsconfig.test.json which includes __tests__ dirs
    files: ['src/**/__tests__/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project:         './tsconfig.test.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars':         ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any':         'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'esbuild.config.js', 'eslint.config.js', 'jest.config.js'],
  },
);
