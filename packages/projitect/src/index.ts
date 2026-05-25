/**
 * `projitect` — main package.
 *
 * Most users do not import from this entry point directly. They import:
 *
 *   - from `projitect/cli` in their `.pjt.ts`
 *   - from `@projitect/blueprint` when authoring blueprints
 *
 * This entry exists to expose the projitect blueprint factory (for tests that want to inspect
 * it without going through `projitect/cli`'s auto-prepend) and a programmatic CLI entry point
 * for embedders.
 */
export { projitectBlueprint } from "./projitect-blueprint.js"
export { dispatch, type DispatchInput, type DispatchResult } from "@projitect/cli-internals"
