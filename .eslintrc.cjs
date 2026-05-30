module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],

    /*
     * Disallowed Tailwind utilities — enforced via no-restricted-syntax.
     * Patterns are matched against the literal contents of any string. This
     * covers className="...", clsx('...'), template literals — anything where
     * the disallowed token appears as a substring.
     *
     * UI primitives in src/components/ui/ are allowed to bypass via overrides
     * below (rare exceptions: shadow inside Loader spinner, etc.).
     */
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "Literal[value=/\\bbg-gradient-(to-|from-|via-|t-|b-|l-|r-|tl-|tr-|bl-|br-)/]",
        message:
          'No gradients — use a solid color from the tokens (bg-primary, bg-bg-subtle, etc).',
      },
      {
        selector:
          "Literal[value=/\\b(shadow-lg|shadow-xl|shadow-2xl|drop-shadow-(md|lg|xl|2xl))\\b/]",
        message: 'No drop shadows — use a 1px border-border instead.',
      },
      {
        selector: "Literal[value=/\\brounded-(xl|2xl|3xl)\\b/]",
        message: 'Border radius capped at rounded (4px). Use rounded-full only for avatars.',
      },
      {
        selector: "Literal[value=/\\btext-(3xl|4xl|5xl|6xl)\\b/]",
        message: 'Font size capped at text-xl (24px). Use text-lg (20) for stat values.',
      },
      {
        selector: "Literal[value=/\\banimate-(bounce|pulse|spin|ping)\\b/]",
        message:
          'No motion utilities. Use transition-colors only. (Spinner in Loader.tsx is the only exception.)',
      },
      {
        selector:
          "Literal[value=/\\b(text|bg|border|ring)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]",
        message:
          'No literal palette colors. Use token utilities: text-primary, text-danger, bg-bg-subtle, etc.',
      },
    ],
  },
  overrides: [
    {
      // Loader is allowed to use animate-spin.
      files: ['src/components/ui/Loader.tsx'],
      rules: { 'no-restricted-syntax': 'off' },
    },
  ],
};
