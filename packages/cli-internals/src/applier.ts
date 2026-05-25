import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Effect } from "effect"
import type {
  ProjectPlan,
  RegionPlanFile,
  MergePlanFile,
  OwnedPlanFile,
  SeedPlanFile,
} from "./plan.js"
import { findRegion, renderRegion, upsertRegion } from "./region.js"
import { mergeIntoExisting } from "./differ.js"
import type { Errors } from "@projitect/core"

const readIfExists = (full: string): Promise<string | null> =>
  fs.readFile(full, "utf8").then(
    (s) => s,
    () => null,
  )

const writeFile = (full: string, content: string): Promise<void> =>
  fs.mkdir(path.dirname(full), { recursive: true }).then(() => fs.writeFile(full, content, "utf8"))

/**
 * Apply a plan to disk. Used by `pjt remodel` (non-destructive) and `pjt build` (after wiping
 * the project tree). Returns the list of paths actually written.
 */
export const applyPlan = (params: {
  readonly plan: ProjectPlan
  readonly projectRoot: string
}): Effect.Effect<ReadonlyArray<string>, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { plan, projectRoot } = params
  return Effect.gen(function* () {
    const written: Array<string> = []
    for (const file of plan.files) {
      const full = path.resolve(projectRoot, file.path)
      const current = yield* Effect.promise(() => readIfExists(full))
      const next = yield* nextContent({ file, current })
      if (next === null) continue // seed-mode no-op
      if (next === current) continue // already in sync
      yield* Effect.promise(() => writeFile(full, next))
      written.push(file.path)
    }
    return written
  })
}

const nextContent = (params: {
  readonly file: RegionPlanFile | MergePlanFile | OwnedPlanFile | SeedPlanFile
  readonly current: string | null
}): Effect.Effect<string | null, Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { file, current } = params
  switch (file.kind) {
    case "region":
      return nextRegion(file, current)
    case "merge":
      return Effect.succeed(nextMerge(file, current))
    case "owned":
      return Effect.succeed(file.content)
    case "seed":
      return Effect.succeed(current === null ? file.content : null)
  }
}

const nextRegion = (
  file: RegionPlanFile,
  current: string | null,
): Effect.Effect<string, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Effect.gen(function* () {
    let content = current ?? ""
    for (const region of file.regions) {
      const found = yield* findRegion({
        fileContent: content,
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        path: file.path,
      })
      const rendered = renderRegion({
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        content: region.content,
      })
      content = upsertRegion({ fileContent: content, existing: found, rendered })
    }
    return content
  })

const nextMerge = (file: MergePlanFile, current: string | null): string => {
  const existing = current === null ? {} : (safeParseJson(current) ?? {})
  const merged = mergeIntoExisting(existing, file.value)
  return `${JSON.stringify(merged, null, 2)}\n`
}

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
