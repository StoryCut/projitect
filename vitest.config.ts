import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "packages/*/vitest.config.mts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
})
