/**
 * @projitect/core
 *
 * Shared contracts. Imported by every other projitect package, by blueprint authors,
 * and (indirectly) by project maintainers.
 */
export * as Blueprint from "./blueprint.js"
export * as ChangeSet from "./change-set.js"
export * as Permission from "./permissions.js"
export * as ProjitectConfig from "./config.js"
export { BlueprintFileSystem } from "./blueprint-filesystem.js"
export type { BlueprintFileSystemShape } from "./blueprint-filesystem.js"
export * as PjtLock from "./lockfile.js"
export * as Errors from "./errors/index.js"
