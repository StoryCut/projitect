/**
 * `projitect` — main package.
 *
 * Most users do not import from this entry point directly. They import:
 *
 *   - from `projitect/cli` in their `.pjt.ts`
 *   - from `@projitect/blueprint` when authoring blueprints
 *
 * This entry exists to expose the implicit blueprint and a programmatic CLI entry point for
 * embedders (e.g. test harnesses).
 */
export { implicitBlueprint } from "./implicit-blueprint.js"
export { dispatch, type DispatchInput, type DispatchResult } from "@projitect/cli-internals"
