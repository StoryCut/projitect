import js from "@eslint/js"
import tseslint from "typescript-eslint"
import unicorn from "eslint-plugin-unicorn"
import eslintComments from "@eslint-community/eslint-plugin-eslint-comments/configs"
import prettierRecommended from "eslint-plugin-prettier/recommended"

/**
 * Flat ESLint config. Two notable structural choices, adapted from StoryCut and effect-clue:
 *
 *  1. **ESLint absorbs Prettier.** `eslint-plugin-prettier/recommended` runs Prettier
 *     as a lint rule, surfacing formatting drift as ESLint errors. One command (`pnpm lint`)
 *     covers everything for JS/TS/JSON files; one CI job. Prettier handles MDX/YAML/JSON5
 *     out-of-band via lint-staged for files ESLint doesn't parse.
 *
 *  2. **Unicorn `recommended` only, not `all`.** The `all` preset is heavily opinionated
 *     and conflicts with Effect-heavy code (custom errors, reduce chains, etc.). We pick
 *     `recommended` and disable the few rules that don't fit.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
      "**/bin/**",
      "**/.husky/**",
      "**/.changeset/*.md",
      "prettier.config.js",
      "vitest.config.ts",
      "eslint.config.js",
      "apps/website/**",
    ],
  },

  // ===== Base presets =====
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  unicorn.configs["flat/recommended"],
  eslintComments.recommended,
  // Prettier must come last — its `/recommended` shape disables conflicting style rules from
  // earlier presets and turns Prettier issues into ESLint errors.
  prettierRecommended,

  // ===== Workspace-wide rules =====
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      // Unicorn overrides — silence rules that don't fit our style.
      // Effect uses `null` as a meaningful absence (vs `Option.none()`); allowed.
      "unicorn/no-null": "off",
      // Some `Effect.gen` returns benefit from `undefined` explicitly.
      "unicorn/no-useless-undefined": [
        "error",
        { checkArguments: false, checkArrowFunctionBody: false },
      ],
      // Schema.TaggedErrorClass constructors clash with this rule.
      "unicorn/custom-error-definition": "off",
      // Effect.forEach + array.forEach are idiomatic for side-effecting iterations.
      "unicorn/no-array-for-each": "off",
      // Array.from(iterable, fn) is sometimes clearer than spread.
      "unicorn/prefer-spread": "off",
      // We use reduce idiomatically (especially in config-cascade and JSON deep-merge).
      "unicorn/no-array-reduce": "off",
      // Too noisy in nested handler chains.
      "unicorn/consistent-function-scoping": "off",
      // Type-safe TS makes the extra-args footgun a non-issue; allow short-form callbacks.
      "unicorn/no-array-callback-reference": "off",
      "unicorn/no-array-method-this-argument": "off",
      // The allowlist would need extension for every code-review iteration; we trust
      // reviewers to call out genuinely bad names. The rule still catches the egregious
      // cases like single-letter top-level variables via other rules.
      "unicorn/prevent-abbreviations": "off",
      // Filenames: kebab-case for TS source, but allow uppercase markdown.
      "unicorn/filename-case": [
        "error",
        {
          cases: { kebabCase: true },
          ignore: [
            /^[A-Z]+\.md$/, // README.md, AGENTS.md, CLAUDE.md
            /^pjt\./, // pjt.fs.permission-denied.mdx etc.
            /SKILL\.md$/,
          ],
        },
      ],

      // ESLint comments
      "@eslint-community/eslint-comments/no-unused-disable": "error",
    },
  },

  // ===== Blueprint packages can't import @effect/platform FileSystem =====
  {
    files: ["packages/blueprint/**", "packages/blueprint-*/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@effect/platform",
              importNames: ["FileSystem"],
              message:
                "Blueprints must use `BlueprintFileSystem` from `@projitect/blueprint`, never `@effect/platform`'s `FileSystem` directly. See https://projitect.dev/docs/concepts/sandbox",
            },
          ],
        },
      ],
    },
  },
)
