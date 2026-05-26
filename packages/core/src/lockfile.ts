import { Schema } from "effect"

/**
 * Per-operation ownership claim recorded in `.pjt.lock`. Mirrors a subset of
 * `ChangeSet.Operation` — just the identity fields needed to find and remove the operation if
 * its source blueprint leaves the tree later. The actual content isn't stored; it's regenerated
 * from the blueprint at plan time.
 */
export const LockRegionOp = Schema.Struct({
  mode: Schema.Literal("region"),
  path: Schema.String,
  ownerId: Schema.String,
  commentPrefix: Schema.String,
  /**
   * Optional — present for prefix/suffix-pair comment styles (HTML/MDX/XML). Absent on
   * older lockfiles, which carried only single-prefix regions; readers treat the absence as
   * the empty string. Bumping the lockfile version is not required because adding an optional
   * field decodes backwards-compatibly.
   */
  commentSuffix: Schema.optional(Schema.String),
})

export const LockMergeOp = Schema.Struct({
  mode: Schema.Literal("merge"),
  path: Schema.String,
  ownedKeys: Schema.Array(Schema.String),
})

export const LockOwnedOp = Schema.Struct({
  mode: Schema.Literal("owned"),
  path: Schema.String,
  ownerId: Schema.String,
})

export const LockSeedOp = Schema.Struct({
  mode: Schema.Literal("seed"),
  path: Schema.String,
  ownerId: Schema.String,
})

export const LockOperation = Schema.Union([LockRegionOp, LockMergeOp, LockOwnedOp, LockSeedOp])

export const BlueprintLockEntry = Schema.Struct({
  version: Schema.String,
  operations: Schema.Array(LockOperation),
})

/**
 * `.pjt.lock` schema. Committed alongside `package.json` so the team's drift-detection stays
 * consistent. Top-level `version` lets us evolve the file format with explicit migrations.
 */
export const PjtLock = Schema.Struct({
  version: Schema.Literal(1),
  blueprints: Schema.Record(Schema.String, BlueprintLockEntry),
})

export type LockRegionOp = typeof LockRegionOp.Type
export type LockMergeOp = typeof LockMergeOp.Type
export type LockOwnedOp = typeof LockOwnedOp.Type
export type LockSeedOp = typeof LockSeedOp.Type
export type LockOperation = typeof LockOperation.Type
export type BlueprintLockEntry = typeof BlueprintLockEntry.Type
export type PjtLock = typeof PjtLock.Type

/** Empty lockfile — used for the very first `pjt init`. */
export const empty: PjtLock = { version: 1, blueprints: {} }
