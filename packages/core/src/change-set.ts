import { Schema } from "effect"
import { dual } from "effect/Function"

/**
 * A `ChangeSet` is the data a blueprint produces when planning. The CLI reduces all blueprints'
 * ChangeSets into a single project-wide plan, detects conflicts, and either applies it (`build`,
 * `remodel`) or reports it (`inspect`).
 *
 * Each operation declares its **ownership mode** via its `_tag`:
 *
 * - `Region` — comment-fenced section inside a shared text file (e.g. `.gitignore`)
 * - `Merge`  — deep-merge intent for a structured file (e.g. `package.json`)
 * - `Owned`  — single blueprint owns the whole file content
 * - `Seed`   — written once at first build; never enforced after
 */
export const RegionOp = Schema.TaggedStruct("Region", {
  ownerId: Schema.String,
  path: Schema.String,
  commentPrefix: Schema.String,
  /**
   * Optional comment suffix for prefix/suffix-pair comment styles (HTML/MDX/XML). When omitted
   * (the default), the marker terminates at end-of-line — that's the right shape for `#`, `//`,
   * `--`, and other single-prefix comment syntaxes. Set to `" -->"` for HTML/markdown.
   */
  commentSuffix: Schema.optional(Schema.String),
  content: Schema.String,
})

export const MergeOp = Schema.TaggedStruct("Merge", {
  ownerId: Schema.String,
  path: Schema.String,
  /** Dotted-path keys this blueprint owns inside the JSON tree (e.g. "scripts.pjt"). */
  ownedKeys: Schema.Array(Schema.String),
  /** Partial JSON value to deep-merge under those keys. */
  value: Schema.Unknown,
})

export const OwnedOp = Schema.TaggedStruct("Owned", {
  ownerId: Schema.String,
  path: Schema.String,
  content: Schema.String,
})

export const SeedOp = Schema.TaggedStruct("Seed", {
  ownerId: Schema.String,
  path: Schema.String,
  content: Schema.String,
})

export const Operation = Schema.Union([RegionOp, MergeOp, OwnedOp, SeedOp])

export const ChangeSet = Schema.Struct({
  operations: Schema.Array(Operation),
})

export type RegionOp = typeof RegionOp.Type
export type MergeOp = typeof MergeOp.Type
export type OwnedOp = typeof OwnedOp.Type
export type SeedOp = typeof SeedOp.Type
export type Operation = typeof Operation.Type
export type ChangeSet = typeof ChangeSet.Type

export const empty: ChangeSet = { operations: [] }

export const concat: {
  (that: ChangeSet): (self: ChangeSet) => ChangeSet
  (self: ChangeSet, that: ChangeSet): ChangeSet
} = dual(
  2,
  (self: ChangeSet, that: ChangeSet): ChangeSet => ({
    operations: [...self.operations, ...that.operations],
  }),
)

export const of = (...ops: readonly Operation[]): ChangeSet => ({ operations: ops })
