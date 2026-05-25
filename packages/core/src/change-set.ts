import { Schema } from "effect"

/**
 * A `ChangeSet` is the data a blueprint produces when planning. The CLI reduces all blueprints'
 * ChangeSets into a single project-wide plan, detects conflicts, and either applies it (`build`,
 * `remodel`) or reports it (`inspect`).
 *
 * Each operation declares its **ownership mode**:
 *
 * - `region`  — comment-fenced section inside a shared text file (e.g. `.gitignore`)
 * - `merge`   — deep-merge intent for a structured file (e.g. `package.json`)
 * - `owned`   — single blueprint owns the whole file content
 * - `seed`    — written once at first build; never enforced after
 */
export const RegionOp = Schema.Struct({
  mode: Schema.Literal("region"),
  ownerId: Schema.String,
  path: Schema.String,
  commentPrefix: Schema.String,
  content: Schema.String,
})

export const MergeOp = Schema.Struct({
  mode: Schema.Literal("merge"),
  ownerId: Schema.String,
  path: Schema.String,
  /** Dotted-path keys this blueprint owns inside the JSON tree (e.g. "scripts.pjt"). */
  ownedKeys: Schema.Array(Schema.String),
  /** Partial JSON value to deep-merge under those keys. */
  value: Schema.Unknown,
})

export const OwnedOp = Schema.Struct({
  mode: Schema.Literal("owned"),
  ownerId: Schema.String,
  path: Schema.String,
  content: Schema.String,
})

export const SeedOp = Schema.Struct({
  mode: Schema.Literal("seed"),
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

export const concat = (a: ChangeSet, b: ChangeSet): ChangeSet => ({
  operations: [...a.operations, ...b.operations],
})

export const of = (...ops: ReadonlyArray<Operation>): ChangeSet => ({ operations: ops })
