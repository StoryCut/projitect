import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettierConfig from "eslint-config-prettier"

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
      "**/bin/**",
      "prettier.config.js",
      "vitest.config.ts",
      "eslint.config.js",
      "apps/website/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The "no `as` casts" rule lives in AGENTS.md as a hard guideline. We don't ship it as a
      // lint rule because discriminated-union narrowing after a switch on `_tag`/`mode` triggers
      // unavoidable casts. Code review remains the enforcement mechanism.
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
    },
  },
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
  prettierConfig,
)
