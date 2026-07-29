// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Beyond the usual hygiene, three rules here exist to hold spec §15's
 * acceptance criteria in place after everyone has forgotten why:
 *
 *  1. currency can only be mutated inside `Economy.ts`;
 *  2. `localStorage` is never touched directly (iOS evicts it — §2.4);
 *  3. no competitor's brand appears anywhere in the repo (§2.2).
 *
 * (3) is additionally covered by `tests/repoHygiene.test.ts`, which scans
 * content rather than syntax.
 */

const CURRENCY_ISOLATION = [
  'error',
  {
    selector: "CallExpression > MemberExpression[property.name='applyCurrency']",
    message:
      'Currency may only be mutated inside src/core/Economy.ts. Use Economy.spend() / Economy.earn().',
  },
  {
    selector:
      "AssignmentExpression > MemberExpression[property.name=/^(coins|gems)$/]",
    message:
      'Currency may only be mutated inside src/core/Economy.ts. Use Economy.spend() / Economy.earn().',
  },
];

export default tseslint.config(
  {
    // `.claude/**` is agent tooling scratch space — throwaway git worktrees, so
    // full copies of the repo. Linting them double-reports everything, and the
    // path-scoped exemptions below (which name `src/core/Economy.ts` exactly)
    // do not match a copy sitting under another prefix, so every legitimate
    // currency mutation in the copy is reported as a violation.
    ignores: [
      'dist/**',
      'node_modules/**',
      '.claude/**',
      'android/**',
      'ios/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': CURRENCY_ISOLATION,
      // Spec §2.4 — Capacitor Preferences only; localStorage is evicted on iOS.
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Use Capacitor Preferences via src/core/storage.ts — localStorage is evicted on iOS.',
        },
        {
          name: 'sessionStorage',
          message: 'Use Capacitor Preferences via src/core/storage.ts.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'localStorage',
          message: 'Use Capacitor Preferences via src/core/storage.ts.',
        },
      ],
    },
  },

  // Economy is the one module allowed to move money, and the one module
  // allowed to import the capability token that unlocks it.
  {
    files: ['src/core/Economy.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },

  // GameState declares `applyCurrency`; it does not call it.
  {
    files: ['src/core/GameState.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression > MemberExpression[property.name='applyCurrency']",
          message: 'Currency may only be mutated inside src/core/Economy.ts.',
        },
      ],
    },
  },

  // Tests deliberately probe the guard, including with a forged token.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
