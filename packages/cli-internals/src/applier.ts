import { promises as fs } from "node:fs"
import path from "node:path"
import { Effect, Match } from "effect"
import { RecordX } from "@nunofyobiz/effect-extras"
import type { Errors } from "@projitect/core"
import type { FilePlan, ProjectPlan, RegionPlanFile, MergePlanFile } from "./plan.js"
import { findRegion, renderRegion, upsertRegion } from "./region.js"

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
}): Effect.Effect<readonly string[], Errors.RegionMissingEnd | Errors.RegionDuplicate> => {
  const { plan, projectRoot } = params
  return Effect.gen(function* () {
    const written: string[] = []
    for (const file of plan.files) {
      const full = path.resolve(projectRoot, file.path)
      const current = yield* Effect.promise(() => readIfExists(full))
      const next = yield* nextContent({ file, current })
      if (next === null) {
        continue
      } // Seed-mode no-op
      if (next === current) {
        continue
      } // Already in sync
      yield* Effect.promise(() => writeFile(full, next))
      written.push(file.path)
    }
    return written
  })
}

const nextContent = (params: {
  readonly file: FilePlan
  readonly current: string | null
}): Effect.Effect<string | null, Errors.RegionMissingEnd | Errors.RegionDuplicate> =>
  Match.valueTags(params.file, {
    Region: (file) => nextRegion(file, params.current),
    Merge: (file) => Effect.succeed(nextMerge(file, params.current)),
    Owned: (file) => Effect.succeed(file.content),
    Seed: (file) => Effect.succeed(params.current === null ? file.content : null),
  })

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
        commentSuffix: file.commentSuffix,
        path: file.path,
      })
      const rendered = renderRegion({
        ownerId: region.ownerId,
        commentPrefix: file.commentPrefix,
        commentSuffix: file.commentSuffix,
        content: region.content,
      })
      content = upsertRegion({ fileContent: content, existing: found, rendered })
    }
    return content
  })

const nextMerge = (file: MergePlanFile, current: string | null): string => {
  const existing = current === null ? {} : (safeParseJson(current) ?? {})
  const merged = RecordX.deepMerge(existing, file.value)
  return `${JSON.stringify(merged, null, 2)}\n`
}

const safeParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
