import { defineConfig } from "vitest/config"

/**
 * Workspace vitest config.
 *
 * The default `include` patterns pick up `**​/*.{test,spec}.{ts,tsx}` across all packages. We
 * don't ship any tests yet (planned for v0.2 once @projitect/test-kit's in-memory FS is
 * exercised), so `vitest run` exits zero on an empty match via `passWithNoTests`.
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
})
