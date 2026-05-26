import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import type { Errors, PjtLock } from "@projitect/core"
import { findRegion } from "./region.js"

/**
 * Apply removal operations to disk. Used by `pjt remodel` / `pjt build` after a blueprint
 * leaves `.pjt.ts` — the operations come from the diff between the previous lockfile and the
 * current blueprint set.
 *
 * Returns the list of paths actually mutated.
 */
export const applyRemovals = (params: {
  readonly removals: ReadonlyArray<PjtLock.LockOperation>
  readonly projectRoot: string
}): Effect.Effect<ReadonlyArray<string>, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { removals, projectRoot } = params
  return Effect.gen(function* () {
    const touched: Array<string> = []
    for (const op of removals) {
      const full = path.resolve(projectRoot, op.path)
      const mutated = yield* applyOne({ op, full })
      if (mutated) touched.push(op.path)
    }
    return touched
  })
}

const readIfExists = (full: string): Promise<string | null> =>
  fs.readFile(full, "utf8").then(
    (s) => s,
    () => null,
  )

const applyOne = (params: {
  readonly op: PjtLock.LockOperation
  readonly full: string
}): Effect.Effect<boolean, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { op, full } = params
  switch (op.mode) {
    case "region": {
      return removeRegion(full, op)
    }
    case "merge": {
      return Effect.promise(() => removeMergeKeys(full, op.ownedKeys))
    }
    case "owned": {
      return Effect.promise(() => removeFile(full))
    }
    case "seed": {
      // seed is write-once; we never delete the file when a seed blueprint leaves
      return Effect.succeed(false)
    }
  }
}

const removeRegion = (
  full: string,
  op: PjtLock.LockRegionOp,
): Effect.Effect<boolean, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.gen(function* () {
    const current = yield* Effect.promise(() => readIfExists(full))
    if (current === null) return false
    const found = yield* findRegion({
      fileContent: current,
      ownerId: op.ownerId,
      commentPrefix: op.commentPrefix,
      path: op.path,
    })
    if (found.kind === "absent") return false
    const lines = current.split("\n")
    const before = lines.slice(0, found.startLine)
    const after = lines.slice(found.endLine + 1)
    const next = [...before, ...after].join("\n")
    yield* Effect.promise(() => fs.writeFile(full, next, "utf8"))
    return true
  })

const removeMergeKeys = async (full: string, keys: ReadonlyArray<string>): Promise<boolean> => {
  const raw = await readIfExists(full)
  if (raw === null) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  if (typeof parsed !== "object" || parsed === null) return false
  let mutated = false
  for (const key of keys) {
    if (deleteDotted(parsed as Record<string, unknown>, key.split("."))) mutated = true
  }
  if (!mutated) return false
  await fs.writeFile(full, `${JSON.stringify(parsed, null, 2)}\n`, "utf8")
  return true
}

const removeFile = async (full: string): Promise<boolean> => {
  try {
    await fs.rm(full, { force: true })
    return true
  } catch {
    return false
  }
}

const deleteDotted = (object: Record<string, unknown>, parts: ReadonlyArray<string>): boolean => {
  if (parts.length === 0) return false
  const [head, ...rest] = parts
  if (head === undefined) return false
  if (rest.length === 0) {
    if (head in object) {
      delete object[head]
      return true
    }
    return false
  }
  const child = object[head]
  if (typeof child !== "object" || child === null || Array.isArray(child)) return false
  const deleted = deleteDotted(child as Record<string, unknown>, rest)
  // Prune empty parents
  if (deleted && Object.keys(child).length === 0) {
    delete object[head]
  }
  return deleted
}
