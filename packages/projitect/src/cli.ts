/**
 * Re-exports the `pjt` config function used in `.pjt.ts`. Users import from here:
 *
 *   import { pjt, directory } from "projitect/cli"
 *
 * Authoring helpers live in `@projitect/blueprint`; this module is intentionally tiny so the
 * dependency from a user's `.pjt.ts` to the projitect codebase stays minimal.
 */
export { pjt } from "@projitect/cli-internals"
export { directory } from "@projitect/blueprint"
