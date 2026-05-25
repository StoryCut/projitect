import { Schema } from "effect"

/**
 * A `Permission` declares one capability a blueprint needs. The CLI checks every
 * `BlueprintFileSystem` call against the union of permissions the blueprint declared, and rejects
 * any operation that isn't covered with a `pjt.fs.permission-denied` error.
 */
export const Read = Schema.Struct({
  kind: Schema.Literal("read"),
  glob: Schema.String,
})

export const Write = Schema.Struct({
  kind: Schema.Literal("write"),
  glob: Schema.String,
})

export const Exec = Schema.Struct({
  kind: Schema.Literal("exec"),
  command: Schema.String,
})

export const Permission = Schema.Union([Read, Write, Exec])

export type Permission = typeof Permission.Type
export type Read = typeof Read.Type
export type Write = typeof Write.Type
export type Exec = typeof Exec.Type
